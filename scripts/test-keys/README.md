# Test Keys

This directory contains test keypairs for development and testing purposes.

## Authority Key

### authority
- **Public Key**: `FkdnNg1bhGKfaJqPdJQwP5MZPADmkEmGa5Uo4vxYqoza`
- **File**: `authority.json`
- **Usage**: Use this as the authority for initializing the predicate registry
- **Environment Variable**: `export ANCHOR_WALLET=scripts/test-keys/authority.json`

## Attestor Keys

### attestor-1
- **Public Key**: `6b1PX55tY4B2MzrG53e6a8mX3CGkhLuDZs9LdVHQ3L44`
- **File**: `attestor-1.json`
- **Register Command**: `export ATTESTOR_PUBKEY=6b1PX55tY4B2MzrG53e6a8mX3CGkhLuDZs9LdVHQ3L44 && npx ts-node scripts/register-attestor.ts`

### attestor-2
- **Public Key**: `H6VsoAJjTFGk2bXaNGpojHri1Ud1zmZuoo4A9Bdkp2UC`
- **File**: `attestor-2.json`
- **Register Command**: `export ATTESTOR_PUBKEY=H6VsoAJjTFGk2bXaNGpojHri1Ud1zmZuoo4A9Bdkp2UC && npx ts-node scripts/register-attestor.ts`

### attestor-3
- **Public Key**: `JAJtV17DAwynd8DvUVsk2HnarazKm1P1yZ4rSpodZBay`
- **File**: `attestor-3.json`
- **Register Command**: `export ATTESTOR_PUBKEY=JAJtV17DAwynd8DvUVsk2HnarazKm1P1yZ4rSpodZBay && npx ts-node scripts/register-attestor.ts`

## Usage Examples

### Using the Authority Key

```bash
# Set the authority wallet for initialization scripts
export ANCHOR_WALLET=scripts/test-keys/authority.json
npx ts-node scripts/initialize-predicate-registry.ts
```

### Registering Attestors

```bash
# Choose one of the attestors above and set the environment variable
export ATTESTOR_PUBKEY=<public-key-from-above>
npx ts-node scripts/register-attestor.ts
```

## Security Notice

⚠️ **These are test keypairs for development only!**
- Do not use these in production
- Do not send real funds to these addresses
- Generate new keypairs for production use
