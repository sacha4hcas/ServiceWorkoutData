import { readFileSync } from 'fs';
import { basename, extname } from 'path';
import { execSync } from 'child_process';
import { URL } from 'url';

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

function loadEnvFile(filePath) {
    const text = readFileSync(filePath, 'utf-8');
    return parseEnvText(text);
}

function resolveInputFilePath() {
    const provided = process.argv[2];
    return provided || 'pdi_sach4.env';
}

function deriveAlias(filePath, env) {
    if (env.SNOW_ALIAS) {
        return env.SNOW_ALIAS;
    }

    const fileName = basename(filePath);
    const extension = extname(fileName);
    const stem = extension ? fileName.slice(0, -extension.length) : fileName;
    const cleanedStem = stem.replace(/^\.env\.?/, '').replace(/^env\./, '').trim();

    if (cleanedStem && cleanedStem !== 'env') {
        return cleanedStem;
    }

    try {
        const host = new URL(env.SNOW_HOST || '').hostname;
        const match = host.match(/(dev\d+)/i);
        if (match) {
            return match[1];
        }
    } catch {
        // Ignore malformed or missing SNOW_HOST values.
    }

    return 'pdi';
}

function main() {
    const filePath = resolveInputFilePath();
    let env;

    try {
        env = loadEnvFile(filePath);
    } catch (error) {
        console.error(`[auth-from-env] Unable to read ${filePath}: ${error.message}`);
        process.exit(1);
    }

    const host = env.SNOW_HOST;
    if (!host) {
        console.error(`[auth-from-env] SNOW_HOST is missing in ${filePath}`);
        process.exit(1);
    }

    const alias = deriveAlias(filePath, env);
    const normalizedHost = host.trim().replace(/\/$/, '');
    const command = `npx now-sdk auth --add ${JSON.stringify(normalizedHost)} --type basic --alias ${JSON.stringify(alias)}`;

    console.log(`[auth-from-env] Using file: ${filePath}`);
    console.log(`[auth-from-env] Host: ${normalizedHost}`);
    console.log(`[auth-from-env] Alias: ${alias}`);
    console.log('[auth-from-env] Launching now-sdk auth --add (basic). Enter username/password when prompted.');

    try {
        execSync(command, { stdio: 'inherit', shell: true });
    } catch (error) {
        console.error(`[auth-from-env] Failed to launch now-sdk: ${error.message}`);
        process.exit(1);
    }
}

main();