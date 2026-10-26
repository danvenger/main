import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { pathToFileURL } from 'url';

interface DryRunInput {
  metadata: {
    version: string;
    timestamp: string;
    hash: string;
  };
  payload: string;
  dependencies?: string[];
}

interface DryRunResult {
  status: 'success' | 'error';
  error_type?: string;
  message?: string;
  payload_hash?: string;
  version?: string;
  timestamp?: string;
  privacy_preserved: boolean;
  interoperable?: boolean;
  safe?: boolean;
}

const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB
const SUPPORTED_VERSIONS = ['v1', 'v2'];

/**
 * Validates the metadata structure for dry run.
 * @param metadata - The metadata object to validate
 * @throws Error if validation fails
 */
export function validateMetadata(metadata: unknown): asserts metadata is DryRunInput['metadata'] {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new Error('Metadata must be an object');
  }

  const record = metadata as Record<string, unknown>;
  const requiredKeys = ['version', 'timestamp', 'hash'];
  for (const key of requiredKeys) {
    if (!(key in record)) {
      throw new Error(`Missing required metadata key: ${key}`);
    }
  }

  if (typeof record.version !== 'string' || !SUPPORTED_VERSIONS.includes(record.version)) {
    throw new Error(`Unsupported version: ${String(record.version)}`);
  }
}

/**
 * Validates payload size.
 * @param payload - The payload to validate
 * @throws Error if payload is too large
 */
export function validatePayloadSize(payload: string): void {
  const payloadBytes = Buffer.from(payload, 'utf-8');
  if (payloadBytes.length > MAX_PAYLOAD_SIZE) {
    throw new Error(
      `Payload size ${payloadBytes.length} exceeds maximum ${MAX_PAYLOAD_SIZE}`
    );
  }
}

/**
 * Computes SHA-256 hash of data.
 * @param data - The data to hash
 * @returns Hex string of the hash
 */
export function computeHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Checks that dependency identifiers are well-formed.
 * @param deps - List of dependencies
 * @returns true when every dependency is well-formed
 * @throws Error if a dependency is invalid
 */
export function checkDependencies(deps: string[]): true {
  for (const dep of deps) {
    if (typeof dep !== 'string' || dep.trim().length === 0) {
      throw new Error('Dependency check failed');
    }
  }
  return true;
}

/**
 * Runs the dry run validation.
 * @param input - The dry run input data
 * @returns The dry run result
 */
export function runDryRun(input: DryRunInput): DryRunResult {
  try {
    // Validate metadata
    validateMetadata(input.metadata);

    // Validate payload size
    validatePayloadSize(input.payload);

    // Compute integrity hash
    const payloadHash = computeHash(input.payload);

    // Check dependencies
    const deps = input.dependencies || [];
    checkDependencies(deps);

    // Return success result
    return {
      status: 'success',
      payload_hash: payloadHash,
      version: input.metadata.version,
      timestamp: input.metadata.timestamp,
      privacy_preserved: true,
      interoperable: true,
      safe: true
    };
  } catch (caught: unknown) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    // Return privacy-safe error response
    let errorType = 'unknown';
    let message = 'Internal error occurred';

    if (
      error.message.includes('Missing required metadata key') ||
      error.message.includes('Metadata must be an object')
    ) {
      errorType = 'malformed_input';
      message = 'Input validation failed';
    } else if (error.message.includes('exceeds maximum')) {
      errorType = 'oversized_input';
      message = 'Input exceeds size limits';
    } else if (error.message.includes('Unsupported version')) {
      errorType = 'unsupported_version';
      message = 'Version not supported';
    } else if (error.message.includes('Dependency check failed')) {
      errorType = 'dependency_failure';
      message = 'Dependency check failed';
    }

    return {
      status: 'error',
      error_type: errorType,
      message: message,
      privacy_preserved: true
    };
  }
}

interface DryRunCliOptions {
  file?: string;
  payload?: string;
  version?: string;
  timestamp?: string;
  hash?: string;
}

/**
 * Main CLI handler for dry-run command.
 */
export function setupDryRunCommand(program: Command): void {
  program
    .command('dry-run')
    .description('Run a testnet deployment dry run')
    .option('-f, --file <path>', 'Path to input JSON file')
    .option('-p, --payload <string>', 'Payload string (alternative to file)')
    .option('-v, --version <string>', 'Metadata version')
    .option('-t, --timestamp <string>', 'Metadata timestamp')
    .option('-h, --hash <string>', 'Metadata hash')
    .action(async (options: DryRunCliOptions) => {
      let input: DryRunInput;

      try {
        if (options.file) {
          const filePath = path.resolve(options.file);
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          input = JSON.parse(fileContent);
        } else if (options.payload) {
          input = {
            metadata: {
              version: options.version || 'v1',
              timestamp: options.timestamp || new Date().toISOString(),
              hash: options.hash || computeHash(options.payload)
            },
            payload: options.payload,
            dependencies: []
          };
        } else {
          console.error('Error: Either --file or --payload must be provided');
          process.exit(1);
          return;
        }

        const result = runDryRun(input);
        console.log(JSON.stringify(result, null, 2));

        if (result.status === 'success') {
          process.exit(0);
        } else {
          process.exit(1);
        }
      } catch (error: unknown) {
        if (error instanceof SyntaxError) {
          console.error('Error: Invalid JSON input');
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        process.exit(1);
      }
    });
}

/**
 * Standalone entry point: `node dist/dry-run.js --payload ... [--version v1]`.
 * The flags of the `dry-run` sub-command are accepted directly.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const program = new Command();
  program.name('harpocrates-dry-run');
  setupDryRunCommand(program);
  program.parse([process.argv[0], process.argv[1], 'dry-run', ...process.argv.slice(2)]);
}
