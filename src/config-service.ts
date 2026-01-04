
// Config Service for interacting with the backend API

export const CONFIG_DEFAULTS = {
  'marketplace.maxListings': 256,
  'marketplace.enabled': true,
  'marketplace.activeSellerTimeoutMs': 60_000,
  'marketplace.maxListingsQuery': 500,
  'marketplace.maxResultsReturned': 30,
  'marketplace.rapPriorityMin': 0.95,
  'marketplace.rapPriorityMax': 1.3,
  'marketplace.rapSmoothingFactor': 10,

  'cache.ttlRap': 60_000,
  'cache.ttlHistory': 600_000,
  'cache.ttlActiveSellers': 15_000,
  'cache.ttlListingsIndex': 30_000,

  'restock.enabled': true,
  'restock.minCcu': 0,

  'packs.buyEnabled': true,

  'transfer.idempotencyTtlSeconds': 600,

  'retry.maxRetries': 5,
  'retry.baseDelayMs': 50,
} as const;

export type ConfigKey = keyof typeof CONFIG_DEFAULTS;
export type ConfigValue<K extends ConfigKey> = (typeof CONFIG_DEFAULTS)[K];

export type Env = 'Dev' | 'Prod';

function getApiConfig(env: Env) {
    const apis = {
        Dev: {
            url: process.env.API_URL_DEV!,
            key: process.env.API_KEY_DEV?.trim().replace(/^["']|["']$/g, '')! 
        },
        Prod: {
            url: process.env.API_URL_PROD!,
            key: process.env.API_KEY_PROD?.trim().replace(/^["']|["']$/g, '')!
        }
    };
    return apis[env];
}

function getHeaders() {
    return {
        [process.env.WAF_HEADER_NAME!]: process.env.WAF_HEADER_VALUE!
    };
}

export async function fetchConfig(env: Env) {
    const api = getApiConfig(env);
    // Use optional chaining for safe property access and provide fallback empty string
    const apiUrl = api?.url ?? '';
    const apiKey = api?.key ?? '';
    
    console.log(`[DEBUG] Fetching config for ${env}`);
    console.log(`[DEBUG] URL: ${apiUrl}`);
    console.log(`[DEBUG] Key Length: ${apiKey.length}`);
    
    // Safety check for critical config
    if (!apiUrl || !apiKey) {
        throw new Error(`Missing configuration for environment: ${env}. Check .env file.`);
    }

    console.log(`[DEBUG] Headers:`, JSON.stringify(getHeaders()));

    try {
        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': apiKey, // Revert to x-api-key as it is standard for AWS API Gateway
                ...getHeaders()
            }
        });

        console.log(`[DEBUG] Response:`, response);
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[DEBUG] Response data:`, JSON.stringify(data, null, 2));
        
        // Validate response structure
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error(`Invalid response format: expected object, got ${typeof data}`);
        }
        
        const responseData = data as Record<string, unknown>;
        
        // Handle nested structure: check if configs are in a 'data' property
        let configsData: Record<string, unknown>;
        if (responseData.data && typeof responseData.data === 'object' && !Array.isArray(responseData.data)) {
            const nestedData = responseData.data as Record<string, unknown>;
            if (nestedData.configs && typeof nestedData.configs === 'object' && !Array.isArray(nestedData.configs)) {
                configsData = nestedData as { configs: Record<string, unknown>, defaults: typeof CONFIG_DEFAULTS };
            } else {
                throw new Error(`Invalid response format: missing or invalid 'configs' property in 'data'. Response: ${JSON.stringify(data)}`);
            }
        } else if (responseData.configs && typeof responseData.configs === 'object' && !Array.isArray(responseData.configs)) {
            // Fallback to root level structure
            configsData = responseData as { configs: Record<string, unknown>, defaults: typeof CONFIG_DEFAULTS };
        } else {
            throw new Error(`Invalid response format: missing or invalid 'configs' property. Response: ${JSON.stringify(data)}`);
        }
        
        return configsData as { configs: Record<string, unknown>, defaults: typeof CONFIG_DEFAULTS };
    } catch (error) {
        console.error(`Failed to fetch config for ${env}:`, error);
        throw error;
    }
}

export async function updateConfig(env: Env, updates: Partial<Record<ConfigKey, unknown>>) {
    const api = getApiConfig(env);
    const apiUrl = api?.url ?? '';
    const apiKey = api?.key ?? '';

    if (!apiUrl || !apiKey) {
        throw new Error(`Missing configuration for environment: ${env}`);
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': apiKey,
                ...getHeaders()
            },
            body: JSON.stringify(updates)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API returned ${response.status}: ${text}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Failed to update config for ${env}:`, error);
        throw error;
    }
}
