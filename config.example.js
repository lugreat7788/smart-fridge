// Copy this file to config.js and fill in your credentials.
// config.js is git-ignored so your keys won't be committed.

const CONFIG = {
  supabase: {
    url: 'https://YOUR_PROJECT_ID.supabase.co',
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
  },
  ai: {
    // 硅基流动 API Key — https://cloud.siliconflow.cn/account/ak
    apiKey: 'sk-YOUR_SILICONFLOW_API_KEY',
    baseUrl: 'https://api.siliconflow.cn/v1',
    // 文字任务（菜谱、购物清单）
    textModel: 'Qwen/Qwen2.5-72B-Instruct',
    // 视觉任务（小票 OCR）
    visionModel: 'Qwen/Qwen2-VL-72B-Instruct',
  },
};
