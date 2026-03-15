import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  StartInstancesCommand,
  type Filter,
  type Instance,
  type RunInstancesCommandInput,
  type Tag,
} from "@aws-sdk/client-ec2";
import type { ActivePeer } from "./types.js";

const COUNTRY_REGION_MAP = {
  SE: "eu-north-1",
  DE: "eu-central-1",
  AE: "me-central-1",
  SG: "ap-southeast-1",
  US: "us-east-1",
} as const;

type SupportedCountryCode = keyof typeof COUNTRY_REGION_MAP;

export type EnsureRelayRequest = {
  countryCode: string;
  waitMs?: number;
};

export type EnsureRelayResponse = {
  ok: true;
  status: "ready" | "provisioning";
  countryCode: SupportedCountryCode;
  region: string;
  message: string;
  relay?: ActivePeer;
  instanceIds?: string[];
  reusedExistingRelay: boolean;
};

type LaunchConfig = {
  region: string;
  instanceType: NonNullable<RunInstancesCommandInput["InstanceType"]>;
  signalingUrl: string;
  gitRepoUrl: string;
  appDirectory: string;
  launchTemplateId?: string;
  launchTemplateName?: string;
  imageId?: string;
  subnetId?: string;
  securityGroupIds: string[];
  keyName?: string;
  iamInstanceProfileArn?: string;
};

type RelayOrchestratorOptions = {
  getPeers: () => ActivePeer[];
};

export class RelayOrchestrator {
  private readonly inflightEnsures = new Map<SupportedCountryCode, Promise<EnsureRelayResponse>>();

  constructor(private readonly options: RelayOrchestratorOptions) {}

  isEnabled(): boolean {
    return process.env.RELAY_AWS_ENABLED === "true";
  }

  getSupportedCountries(): SupportedCountryCode[] {
    return Object.keys(COUNTRY_REGION_MAP) as SupportedCountryCode[];
  }

  async ensureRelay(request: EnsureRelayRequest): Promise<EnsureRelayResponse> {
    const countryCode = normalizeCountryCode(request.countryCode);
    if (!countryCode) {
      throw new Error(`Unsupported relay country \"${request.countryCode}\".`);
    }

    const existingInflight = this.inflightEnsures.get(countryCode);
    if (existingInflight) {
      return existingInflight;
    }

    const promise = this.ensureRelayInternal(countryCode, request.waitMs);
    this.inflightEnsures.set(countryCode, promise);

    try {
      return await promise;
    } finally {
      this.inflightEnsures.delete(countryCode);
    }
  }

  private async ensureRelayInternal(countryCode: SupportedCountryCode, requestedWaitMs?: number): Promise<EnsureRelayResponse> {
    const activeRelay = this.findActiveRelay(countryCode);
    if (activeRelay) {
      return {
        ok: true,
        status: "ready",
        countryCode,
        region: COUNTRY_REGION_MAP[countryCode],
        message: `An active ${countryCode} relay is already registered.`,
        relay: activeRelay,
        reusedExistingRelay: true,
      };
    }

    if (!this.isEnabled()) {
      throw new Error("Relay orchestrator is disabled. Set RELAY_AWS_ENABLED=true to allow on-demand AWS relay launches.");
    }

    const launchConfig = this.loadLaunchConfig(countryCode);
    const ec2Client = new EC2Client({ region: launchConfig.region });
    const existingInstance = await this.findManagedInstance(ec2Client, countryCode);

    if (existingInstance?.InstanceId) {
      const instanceState = existingInstance.State?.Name;

      if (instanceState === "stopped") {
        await ec2Client.send(new StartInstancesCommand({ InstanceIds: [existingInstance.InstanceId] }));
      }

      const relay = await this.waitForRelayRegistration(countryCode, requestedWaitMs);
      if (relay) {
        return {
          ok: true,
          status: "ready",
          countryCode,
          region: launchConfig.region,
          message: `A managed ${countryCode} relay is now available.`,
          relay,
          instanceIds: [existingInstance.InstanceId],
          reusedExistingRelay: true,
        };
      }

      return {
        ok: true,
        status: "provisioning",
        countryCode,
        region: launchConfig.region,
        message: `A managed ${countryCode} relay instance already exists and is still registering.`,
        instanceIds: [existingInstance.InstanceId],
        reusedExistingRelay: true,
      };
    }

    const runInput = this.buildRunInstancesInput(countryCode, launchConfig);
    const launched = await ec2Client.send(new RunInstancesCommand(runInput));
    const instanceIds = (launched.Instances ?? []).flatMap((instance) => (instance.InstanceId ? [instance.InstanceId] : []));
    const relay = await this.waitForRelayRegistration(countryCode, requestedWaitMs);

    if (relay) {
      return {
        ok: true,
        status: "ready",
        countryCode,
        region: launchConfig.region,
        message: `Managed ${countryCode} relay launched and registered successfully.`,
        relay,
        instanceIds,
        reusedExistingRelay: false,
      };
    }

    return {
      ok: true,
      status: "provisioning",
      countryCode,
      region: launchConfig.region,
      message: `Managed ${countryCode} relay launched. Waiting for the node to finish bootstrapping and register with signaling.`,
      instanceIds,
      reusedExistingRelay: false,
    };
  }

  private findActiveRelay(countryCode: SupportedCountryCode): ActivePeer | null {
    return (
      this.options.getPeers().find(
        (peer) => peer.countryCode === countryCode && peer.transport?.mode === "peer-agent",
      ) ?? null
    );
  }

  private async findManagedInstance(ec2Client: EC2Client, countryCode: SupportedCountryCode): Promise<Instance | null> {
    const filters: Filter[] = [
      { Name: "tag:Project", Values: ["relay-mesh"] },
      { Name: "tag:CountryCode", Values: [countryCode] },
      { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] },
    ];

    const response = await ec2Client.send(new DescribeInstancesCommand({ Filters: filters }));
    const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);

    return instances.sort((left, right) => {
      const leftTime = left.LaunchTime?.getTime() ?? 0;
      const rightTime = right.LaunchTime?.getTime() ?? 0;
      return rightTime - leftTime;
    })[0] ?? null;
  }

  private buildRunInstancesInput(countryCode: SupportedCountryCode, launchConfig: LaunchConfig): RunInstancesCommandInput {
    const tags: Tag[] = [
      { Key: "Name", Value: `relay-mesh-${countryCode.toLowerCase()}` },
      { Key: "Project", Value: "relay-mesh" },
      { Key: "ManagedBy", Value: "relay-orchestrator" },
      { Key: "CountryCode", Value: countryCode },
    ];

    const runInput: RunInstancesCommandInput = {
      MinCount: 1,
      MaxCount: 1,
      InstanceType: launchConfig.instanceType,
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: tags,
        },
      ],
      UserData: Buffer.from(this.buildUserData(countryCode, launchConfig)).toString("base64"),
    };

    if (launchConfig.launchTemplateId || launchConfig.launchTemplateName) {
      runInput.LaunchTemplate = {
        LaunchTemplateId: launchConfig.launchTemplateId,
        LaunchTemplateName: launchConfig.launchTemplateName,
      };
      return runInput;
    }

    if (!launchConfig.imageId || !launchConfig.subnetId || launchConfig.securityGroupIds.length === 0) {
      throw new Error(
        `Missing AWS launch configuration for ${countryCode}. Configure a launch template or set RELAY_AWS_AMI_ID_${countryCode}, RELAY_AWS_SUBNET_ID_${countryCode}, and RELAY_AWS_SECURITY_GROUP_IDS_${countryCode}.`,
      );
    }

    runInput.ImageId = launchConfig.imageId;
    runInput.SubnetId = launchConfig.subnetId;
    runInput.SecurityGroupIds = launchConfig.securityGroupIds;

    if (launchConfig.keyName) {
      runInput.KeyName = launchConfig.keyName;
    }

    if (launchConfig.iamInstanceProfileArn) {
      runInput.IamInstanceProfile = {
        Arn: launchConfig.iamInstanceProfileArn,
      };
    }

    return runInput;
  }

  private buildUserData(countryCode: SupportedCountryCode, launchConfig: LaunchConfig): string {
    return [
      "#!/bin/bash",
      "set -euxo pipefail",
      `sudo -u ubuntu bash -lc 'cd /home/ubuntu && if [ ! -d proxyVpn/.git ]; then git clone \"${launchConfig.gitRepoUrl}\" proxyVpn; fi && cd ${launchConfig.appDirectory} && git pull --ff-only origin main || true && chmod +x deploy/bootstrap-ubuntu-relay.sh && ./deploy/bootstrap-ubuntu-relay.sh ${countryCode} ${launchConfig.signalingUrl}'`,
    ].join("\n");
  }

  private loadLaunchConfig(countryCode: SupportedCountryCode): LaunchConfig {
    const region = process.env[`RELAY_AWS_REGION_${countryCode}`] ?? COUNTRY_REGION_MAP[countryCode];
    const signalingUrl = process.env.RELAY_AWS_SIGNALING_URL;

    if (!signalingUrl) {
      throw new Error("Missing RELAY_AWS_SIGNALING_URL. The orchestrator needs the public signaling URL to bootstrap new relay nodes.");
    }

    return {
      region,
      instanceType: ((process.env[`RELAY_AWS_INSTANCE_TYPE_${countryCode}`] ?? process.env.RELAY_AWS_DEFAULT_INSTANCE_TYPE ?? "t3.micro") as NonNullable<
        RunInstancesCommandInput["InstanceType"]
      >),
      signalingUrl,
      gitRepoUrl: process.env.RELAY_AWS_GIT_REPO_URL ?? "https://github.com/Geniue/proxyVpn.git",
      appDirectory: process.env.RELAY_AWS_APP_DIRECTORY ?? "/home/ubuntu/proxyVpn",
      launchTemplateId: process.env[`RELAY_AWS_LAUNCH_TEMPLATE_ID_${countryCode}`],
      launchTemplateName: process.env[`RELAY_AWS_LAUNCH_TEMPLATE_NAME_${countryCode}`],
      imageId: process.env[`RELAY_AWS_AMI_ID_${countryCode}`],
      subnetId: process.env[`RELAY_AWS_SUBNET_ID_${countryCode}`],
      securityGroupIds: parseCsv(process.env[`RELAY_AWS_SECURITY_GROUP_IDS_${countryCode}`]),
      keyName: process.env[`RELAY_AWS_KEY_NAME_${countryCode}`],
      iamInstanceProfileArn: process.env[`RELAY_AWS_INSTANCE_PROFILE_ARN_${countryCode}`],
    };
  }

  private async waitForRelayRegistration(countryCode: SupportedCountryCode, requestedWaitMs?: number): Promise<ActivePeer | null> {
    const timeoutMs = Math.max(0, Math.min(requestedWaitMs ?? defaultEnsureWaitMs(), 120_000));
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const relay = this.findActiveRelay(countryCode);
      if (relay) {
        return relay;
      }

      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }

    return null;
  }
}

function normalizeCountryCode(countryCode: string): SupportedCountryCode | null {
  const normalized = countryCode.trim().toUpperCase();
  return normalized in COUNTRY_REGION_MAP ? (normalized as SupportedCountryCode) : null;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function defaultEnsureWaitMs(): number {
  const configured = Number(process.env.RELAY_AWS_ENSURE_WAIT_MS ?? 30_000);
  return Number.isFinite(configured) ? configured : 30_000;
}