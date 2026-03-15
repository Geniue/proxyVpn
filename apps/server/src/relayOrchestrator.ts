import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
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

export type ReleaseRelayRequest = {
  countryCode: string;
  leaseId: string;
};

export type ReleaseRelayResponse = {
  ok: true;
  status: "released" | "idle";
  countryCode: SupportedCountryCode;
  message: string;
  activeLeaseCount: number;
};

export type RelayCleanupAction = {
  countryCode: SupportedCountryCode;
  region: string;
  action: "stopped" | "terminated" | "skipped";
  instanceIds: string[];
  message: string;
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

type RelayLeaseState = {
  activeLeaseIds: Set<string>;
  lastReleasedAt: number | null;
};

export class RelayOrchestrator {
  private readonly inflightEnsures = new Map<SupportedCountryCode, Promise<EnsureRelayResponse>>();
  private readonly leaseState = new Map<SupportedCountryCode, RelayLeaseState>();

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

  acquireLease(countryCodeInput: string, leaseId: string): void {
    const countryCode = normalizeCountryCode(countryCodeInput);
    if (!countryCode) {
      return;
    }

    const state = this.getLeaseState(countryCode);
    state.activeLeaseIds.add(leaseId);
    state.lastReleasedAt = null;
  }

  releaseLease(request: ReleaseRelayRequest): ReleaseRelayResponse {
    const countryCode = normalizeCountryCode(request.countryCode);
    if (!countryCode) {
      throw new Error(`Unsupported relay country \"${request.countryCode}\".`);
    }

    const state = this.getLeaseState(countryCode);
    state.activeLeaseIds.delete(request.leaseId);

    if (state.activeLeaseIds.size === 0) {
      state.lastReleasedAt = Date.now();
      return {
        ok: true,
        status: "idle",
        countryCode,
        message: `No active relay leases remain for ${countryCode}. Idle cleanup timer is now running.`,
        activeLeaseCount: 0,
      };
    }

    return {
      ok: true,
      status: "released",
      countryCode,
      message: `Released one relay lease for ${countryCode}.`,
      activeLeaseCount: state.activeLeaseIds.size,
    };
  }

  async cleanupIdleRelays(): Promise<RelayCleanupAction[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const actions: RelayCleanupAction[] = [];
    const cleanupMode = this.getCleanupMode();
    const idleTimeoutMs = this.getIdleTimeoutMs();

    for (const countryCode of this.getSupportedCountries()) {
      const state = this.getLeaseState(countryCode);
      if (state.activeLeaseIds.size > 0 || state.lastReleasedAt === null) {
        continue;
      }

      if (Date.now() - state.lastReleasedAt < idleTimeoutMs) {
        continue;
      }

      const launchConfig = this.loadLaunchConfig(countryCode);
      const ec2Client = new EC2Client({ region: launchConfig.region });
      const instances = await this.findManagedInstances(ec2Client, countryCode);
      const desiredCapacity = this.getDesiredCapacity(countryCode);
      const candidates = instances.slice(desiredCapacity);

      if (candidates.length === 0) {
        state.lastReleasedAt = null;
        actions.push({
          countryCode,
          region: launchConfig.region,
          action: "skipped",
          instanceIds: [],
          message: `No extra managed ${countryCode} relay instances are eligible for cleanup.`,
        });
        continue;
      }

      const candidateIds = candidates.flatMap((instance) => (instance.InstanceId ? [instance.InstanceId] : []));
      if (candidateIds.length === 0) {
        continue;
      }

      if (cleanupMode === "terminate") {
        await ec2Client.send(new TerminateInstancesCommand({ InstanceIds: candidateIds }));
        actions.push({
          countryCode,
          region: launchConfig.region,
          action: "terminated",
          instanceIds: candidateIds,
          message: `Terminated idle managed ${countryCode} relay instances.`,
        });
      } else {
        const stoppableIds = candidates
          .filter((instance) => instance.InstanceId && instance.State?.Name === "running")
          .flatMap((instance) => (instance.InstanceId ? [instance.InstanceId] : []));

        if (stoppableIds.length === 0) {
          actions.push({
            countryCode,
            region: launchConfig.region,
            action: "skipped",
            instanceIds: candidateIds,
            message: `Managed ${countryCode} relay instances were already stopped or not stoppable.`,
          });
        } else {
          await ec2Client.send(new StopInstancesCommand({ InstanceIds: stoppableIds }));
          actions.push({
            countryCode,
            region: launchConfig.region,
            action: "stopped",
            instanceIds: stoppableIds,
            message: `Stopped idle managed ${countryCode} relay instances.`,
          });
        }
      }

      state.lastReleasedAt = null;
    }

    return actions;
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

  private getLeaseState(countryCode: SupportedCountryCode): RelayLeaseState {
    const existing = this.leaseState.get(countryCode);
    if (existing) {
      return existing;
    }

    const created: RelayLeaseState = {
      activeLeaseIds: new Set<string>(),
      lastReleasedAt: null,
    };
    this.leaseState.set(countryCode, created);
    return created;
  }

  private async findManagedInstance(ec2Client: EC2Client, countryCode: SupportedCountryCode): Promise<Instance | null> {
    return (await this.findManagedInstances(ec2Client, countryCode))[0] ?? null;
  }

  private async findManagedInstances(ec2Client: EC2Client, countryCode: SupportedCountryCode): Promise<Instance[]> {
    const filters: Filter[] = [
      { Name: "tag:Project", Values: ["relay-mesh"] },
      { Name: "tag:CountryCode", Values: [countryCode] },
      { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] },
    ];

    const response = await ec2Client.send(new DescribeInstancesCommand({ Filters: filters }));
    return (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []).sort((left, right) => {
      const leftTime = left.LaunchTime?.getTime() ?? 0;
      const rightTime = right.LaunchTime?.getTime() ?? 0;
      return rightTime - leftTime;
    });
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
      "if command -v apt-get >/dev/null 2>&1; then apt-get update && apt-get install -y ca-certificates curl git; elif command -v dnf >/dev/null 2>&1; then dnf install -y ca-certificates git && (command -v curl >/dev/null 2>&1 || dnf install -y curl-minimal); fi",
      "PRIMARY_USER=root",
      "if id -u ubuntu >/dev/null 2>&1; then PRIMARY_USER=ubuntu; elif id -u ec2-user >/dev/null 2>&1; then PRIMARY_USER=ec2-user; fi",
      "PRIMARY_HOME=$(getent passwd \"$PRIMARY_USER\" | cut -d: -f6)",
      `APP_DIR=\"${launchConfig.appDirectory}\"`,
      `if [ \"${launchConfig.appDirectory}\" = \"/home/ubuntu/proxyVpn\" ] && [ \"$PRIMARY_USER\" != \"ubuntu\" ]; then APP_DIR=\"${'${PRIMARY_HOME}'}/proxyVpn\"; fi`,
      `if [ ! -d "${'${APP_DIR}'}/.git" ]; then git clone "${launchConfig.gitRepoUrl}" "${'${APP_DIR}'}"; chown -R "$PRIMARY_USER:$PRIMARY_USER" "${'${APP_DIR}'}" || true; fi`,
      "cd \"${APP_DIR}\"",
      "git pull --ff-only origin main || true",
      "chmod +x deploy/bootstrap-ubuntu-relay.sh",
      `APP_USER=\"$PRIMARY_USER\" APP_DIR=\"${'${APP_DIR}'}\" ./deploy/bootstrap-ubuntu-relay.sh ${countryCode} ${launchConfig.signalingUrl}`,
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

  private getDesiredCapacity(countryCode: SupportedCountryCode): number {
    const configured = Number(process.env[`RELAY_AWS_DESIRED_CAPACITY_${countryCode}`] ?? process.env.RELAY_AWS_DESIRED_CAPACITY_DEFAULT ?? 0);
    return Number.isFinite(configured) ? Math.max(0, Math.floor(configured)) : 0;
  }

  private getIdleTimeoutMs(): number {
    const configured = Number(process.env.RELAY_AWS_IDLE_TIMEOUT_MS ?? 600_000);
    return Number.isFinite(configured) ? Math.max(60_000, configured) : 600_000;
  }

  private getCleanupMode(): "stop" | "terminate" {
    return process.env.RELAY_AWS_CLEANUP_MODE === "terminate" ? "terminate" : "stop";
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