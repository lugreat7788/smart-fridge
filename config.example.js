// Copy this file to config.js and fill in your credentials.
// config.js is git-ignored so your keys won't be committed.

const CONFIG = {
  cloudbase: {
    // 腾讯云 CloudBase 控制台 → 环境 → 环境 ID
    envId: 'YOUR_ENV_ID',
  },
  ai: {
    // 硅基流动 API Key — https://cloud.siliconflow.cn/account/ak
    apiKey: 'sk-YOUR_SILICONFLOW_API_KEY',
    baseUrl: 'https://api.siliconflow.cn/v1',
    textModel: 'Qwen/Qwen2.5-72B-Instruct',
    visionModel: 'Qwen/Qwen3-VL-8B-Instruct',
  },
};
