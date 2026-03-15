# Country To Infrastructure Map

Use one relay node per actual exit country.

## AWS-backed countries
- `SE` -> `eu-north-1` Stockholm
- `DE` -> `eu-central-1` Frankfurt
- `AE` -> `me-central-1` UAE
- `SG` -> `ap-southeast-1` Singapore
- `US` -> `us-east-1` or `us-west-2`

## Not available on AWS directly
- `TR` -> no native AWS Turkey region

For `TR`, use a different cloud or VPS provider with infrastructure physically located in Turkey, then run the same relay-agent and set `RELAY_AGENT_COUNTRY=TR`.

## Verification rule
A country should only be shown to users as available when `/peers` contains at least one live relay for that country.