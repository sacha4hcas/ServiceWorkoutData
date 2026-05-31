/**
 * Calls a ServiceNow REST endpoint with Basic auth, then runs `npm run transform`.
 * Credentials and endpoint are read from a dotenv file in the project root.
 *
 * Required variables:
 *   SNOW_PASSWORD   - password for the ServiceNow admin user
 *   SNOW_API_PATH   - API path to call, e.g. /api/1974893/load_data_to_app
 *
 * Optional variables (defaults shown):
 *   SNOW_HOST       - https://dev317588.service-now.com
 *   SNOW_USERNAME   - admin
 *   SNOW_METHOD     - GET
 *   SNOW_DATA_SCOPE - target scope query parameter
 *   SNOW_APP_SCOPE  - source scope query parameter
 *   SNOW_BODY       - (JSON string body for POST/PUT requests)
 *
 * Usage:
 *   npm run backup -- dev
 *   npm run backup -- --env dev
 *
 * Those examples load dev-specific dotenv files first, then fall back to .env.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { request } from 'https';
import { URL } from 'url';

// ---------------------------------------------------------------------------
// Resolve the requested environment name
// ---------------------------------------------------------------------------
function getEnvironmentName() {
    const args = process.argv.slice(2);

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--env' || arg === '-e') {
            return args[index + 1] || '';
        }
        if (arg.startsWith('--env=')) {
            return arg.slice('--env='.length);
        }
    }

    const positional = args.find((arg) => !arg.startsWith('-'));
    return positional || '';
}

// ---------------------------------------------------------------------------
// Parse dotenv file(s) without external dependencies
// ---------------------------------------------------------------------------
function parseEnvText(text) {
    const env = {};

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        env[key] = value;
    }

    return env;
}

function loadEnv(environmentName) {
    const candidates = [];

    if (environmentName) {
        candidates.push(environmentName);
        candidates.push(`${environmentName}.env`);
        candidates.push(`.env.${environmentName}`);
        candidates.push(`.env.${environmentName}.local`);
        candidates.push(`${environmentName}.local`);
    }

    candidates.push('.env');

    for (const fileName of candidates) {
        try {
            const text = readFileSync(fileName, 'utf-8');
            return { env: parseEnvText(text), fileName };
        } catch {
            // Try the next candidate.
        }
    }

    return { env: {}, fileName: null };
}

const environmentName = getEnvironmentName();
const { env, fileName: loadedEnvFile } = loadEnv(environmentName);

if (environmentName) {
    if (loadedEnvFile) {
        console.log(`[fetch-and-transform] Using environment "${environmentName}" from ${loadedEnvFile}`);
    } else {
        console.log(`[fetch-and-transform] Using environment "${environmentName}" (no dotenv file found, falling back to defaults)`);
    }
} else if (loadedEnvFile) {
    console.log(`[fetch-and-transform] Using dotenv file ${loadedEnvFile}`);
}

const host     = env.SNOW_HOST     || 'https://dev317588.service-now.com';
const username = env.SNOW_USERNAME || 'admin';
const password = env.SNOW_PASSWORD;
const apiPath  = env.SNOW_API_PATH;
const method   = (env.SNOW_METHOD  || 'GET').toUpperCase();
const targetScope = env.SNOW_DATA_SCOPE || '';
const sourceScope = env.SNOW_APP_SCOPE || '';
const body     = env.SNOW_BODY     || null;

// ---------------------------------------------------------------------------
// Validate required variables
// ---------------------------------------------------------------------------
if (!password) {
    console.error(`Error: SNOW_PASSWORD is not set in ${loadedEnvFile || '.env'}`);
    process.exit(1);
}

if (!apiPath) {
    console.error(`Error: SNOW_API_PATH is not set in ${loadedEnvFile || '.env'}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Build request
// ---------------------------------------------------------------------------
const token = Buffer.from(`${username}:${password}`).toString('base64');
let url;
try {
    url = new URL(apiPath, host);
    if (targetScope) {
        url.searchParams.set('target_scope', targetScope);
    }
    if (sourceScope) {
        url.searchParams.set('source_scope', sourceScope);
    }
} catch (e) {
    console.error(`Error: Invalid URL constructed from SNOW_HOST="${host}" and SNOW_API_PATH="${apiPath}"`);
    process.exit(1);
}

const bodyBuffer = body ? Buffer.from(body, 'utf-8') : null;

const options = {
    method,
    headers: {
        'Authorization': `Basic ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(bodyBuffer ? { 'Content-Length': bodyBuffer.length } : {})
    }
};

console.log(`[fetch-and-transform] ${method} ${url.href}`);

const req = request(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[fetch-and-transform] Success (HTTP ${res.statusCode})`);
            if (data) {
                try {
                    console.log(JSON.stringify(JSON.parse(data), null, 2));
                } catch {
                    console.log(data);
                }
            }
            console.log('\n[fetch-and-transform] Running npm run transform...\n');
            try {
                execSync('npm run transform', { stdio: 'inherit' });
            } catch (err) {
                console.error('[fetch-and-transform] npm run transform failed');
                process.exit(err.status ?? 1);
            }
        } else {
            console.error(`[fetch-and-transform] Request failed (HTTP ${res.statusCode}):`);
            console.error(data);
            process.exit(1);
        }
    });
});

req.on('error', (err) => {
    console.error(`[fetch-and-transform] Network error: ${err.message}`);
    process.exit(1);
});

if (bodyBuffer) {
    req.write(bodyBuffer);
}
req.end();
