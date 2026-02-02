import axios from 'axios';
import * as db from './db';

// Coze API 配置 - 默认值（优先从数据库读取）
const COZE_API_URL = 'https://api.coze.cn/v1';

// 默认工作流 ID（如果数据库中没有配置则使用这些默认值）
const DEFAULT_WORKFLOW_IDS = {
  FACE_SWAP_SINGLE: '7578419604687552562',      // 单人换脸 (swap_face_total)
  FACE_SWAP_COUPLE: '7574050703116075050',      // 双人换脸 (Runninghub_swap_faces)
  USER_ANALYZE: '7554026919391150095',          // 用户判别
};

// 配置缓存
let configCache: {
  apiKey?: string;
  botId?: string;
  singleFaceWorkflowId?: string;
  doubleFaceWorkflowId?: string;
  userAnalyzeWorkflowId?: string;
  lastFetch?: number;
} = {};

const CACHE_TTL = 60000; // 缓存1分钟

// 从数据库获取配置（带缓存）
async function getCozeConfig() {
  const now = Date.now();
  if (configCache.lastFetch && (now - configCache.lastFetch) < CACHE_TTL) {
    return configCache;
  }
  
  try {
    const [apiKey, botId, singleFaceWorkflowId, doubleFaceWorkflowId, userAnalyzeWorkflowId] = await Promise.all([
      db.getSystemConfig('COZE_API_KEY'),
      db.getSystemConfig('COZE_BOT_ID'),
      db.getSystemConfig('COZE_SINGLE_FACE_WORKFLOW_ID'),
      db.getSystemConfig('COZE_DOUBLE_FACE_WORKFLOW_ID'),
      db.getSystemConfig('COZE_USER_ANALYZE_WORKFLOW_ID'),
    ]);

    configCache = {
      apiKey: apiKey || process.env.COZE_API_KEY || '',
      botId: botId || process.env.COZE_BOT_ID || '',
      singleFaceWorkflowId: singleFaceWorkflowId || DEFAULT_WORKFLOW_IDS.FACE_SWAP_SINGLE,
      doubleFaceWorkflowId: doubleFaceWorkflowId || DEFAULT_WORKFLOW_IDS.FACE_SWAP_COUPLE,
      userAnalyzeWorkflowId: userAnalyzeWorkflowId || DEFAULT_WORKFLOW_IDS.USER_ANALYZE,
      lastFetch: now,
    };

    console.log('[Coze] Config loaded from database, botId:', botId ? 'set' : 'not set');
  } catch (error) {
    console.error('[Coze] Failed to load config from database, using defaults:', error);
    // 使用环境变量或默认值
    configCache = {
      apiKey: process.env.COZE_API_KEY || '',
      botId: process.env.COZE_BOT_ID || '',
      singleFaceWorkflowId: DEFAULT_WORKFLOW_IDS.FACE_SWAP_SINGLE,
      doubleFaceWorkflowId: DEFAULT_WORKFLOW_IDS.FACE_SWAP_COUPLE,
      userAnalyzeWorkflowId: DEFAULT_WORKFLOW_IDS.USER_ANALYZE,
      lastFetch: now,
    };
  }
  
  return configCache;
}

// 清除配置缓存（在配置更新后调用）
export function clearCozeConfigCache() {
  configCache = {};
  console.log('[Coze] Config cache cleared');
}

interface CozeWorkflowResponse {
  code: number;
  msg: string;
  execute_id?: string;
  data?: string;
}

interface CozeWorkflowStatusResponse {
  code: number;
  msg: string;
  data?: {
    status: 'running' | 'completed' | 'failed';
    output?: string;
    error?: string;
  };
}

function isNonEmptyString(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0;
}

function redactUrlForLogs(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (!looksLikeJson) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function pickFirstNonEmptyString(obj: any, keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function coerceSuccessFlag(value: any): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'success', 'succeeded', 'ok', '1'].includes(normalized)) return true;
    if (['false', 'fail', 'failed', 'error', '0'].includes(normalized)) return false;
  }
  return undefined;
}

function normalizeCozeWorkflowOutput(raw: any): any {
  let current: any = raw;

  for (let i = 0; i < 6; i++) {
    current = safeJsonParse(current);

    if (Array.isArray(current) && current.length === 1) {
      current = current[0];
      continue;
    }

    if (current && typeof current === 'object') {
      // Stop unwrapping once it already looks like the analysis payload
      if (
        'info' in current ||
        'urls' in current ||
        'face_type' in current ||
        'faceType' in current ||
        'gender' in current ||
        'userType' in current
      ) {
        return current;
      }

      const next =
        (current as any).output ??
        (current as any).result ??
        (current as any).data ??
        (current as any).json;
      if (next !== undefined && next !== current) {
        current = next;
        continue;
      }
    }

    break;
  }

  return current;
}

type UrlProbeResult =
  | { ok: true; status: number; finalUrl: string; contentType?: string; contentLength?: string }
  | { ok: false; status?: number; finalUrl?: string; error: string };

async function probeRemoteUrl(url: string): Promise<UrlProbeResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'URL 不是 http(s)' };
  }

  const timeout = 2500;

  try {
    const head = await axios.head(url, {
      timeout,
      maxRedirects: 3,
      validateStatus: () => true,
    });
    const finalUrl = (head.request as any)?.res?.responseUrl || url;
    const status = head.status;
    const contentType = typeof head.headers?.['content-type'] === 'string' ? head.headers['content-type'] : undefined;
    const contentLength = typeof head.headers?.['content-length'] === 'string' ? head.headers['content-length'] : undefined;

    if (status >= 200 && status < 400) {
      return { ok: true, status, finalUrl, contentType, contentLength };
    }

    // Some COS configs may not allow HEAD; try a lightweight GET probe.
    const get = await axios.get(url, {
      timeout,
      maxRedirects: 3,
      responseType: 'arraybuffer',
      headers: {
        Range: 'bytes=0-0',
      },
      validateStatus: () => true,
    });
    const getFinalUrl = (get.request as any)?.res?.responseUrl || finalUrl;
    const getStatus = get.status;
    const getContentType = typeof get.headers?.['content-type'] === 'string' ? get.headers['content-type'] : contentType;
    const getContentLength =
      typeof get.headers?.['content-length'] === 'string' ? get.headers['content-length'] : contentLength;

    if (getStatus >= 200 && getStatus < 400) {
      return { ok: true, status: getStatus, finalUrl: getFinalUrl, contentType: getContentType, contentLength: getContentLength };
    }

    return { ok: false, status: getStatus, finalUrl: getFinalUrl, error: `HTTP ${getStatus}` };
  } catch (error: any) {
    return { ok: false, error: error?.message ? String(error.message) : 'probe failed' };
  }
}

function looksLikeErrorText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const needles = [
    'fail',
    'failed',
    'error',
    'invalid',
    'denied',
    'timeout',
    '超时',
    '失败',
    '错误',
    '异常',
    '未',
    '无',
    '空',
    '限制',
    '过期',
    '不可',
  ];
  return needles.some((n) => normalized.includes(n));
}

function extractFaceAnalysisErrorMessage(raw: any): string | null {
  const normalized = normalizeCozeWorkflowOutput(raw);
  if (!normalized) return null;

  // Prefer explicit error fields
  const directError =
    pickFirstNonEmptyString(normalized, ['errorMessage', 'error', 'error_msg', 'errorMsg']) ||
    pickFirstNonEmptyString(normalized, ['message', 'msg']);
  if (directError && looksLikeErrorText(directError)) return directError;

  const info = normalizeCozeWorkflowOutput((normalized as any).info);
  if (info && typeof info === 'object') {
    const successFlag = coerceSuccessFlag((info as any).success);
    const infoError =
      pickFirstNonEmptyString(info, ['errorMessage', 'error', 'error_msg', 'errorMsg']) ||
      pickFirstNonEmptyString(info, ['message', 'msg']);
    if (infoError && (successFlag === false || looksLikeErrorText(infoError))) return infoError;

    const data = normalizeCozeWorkflowOutput((info as any).data ?? (info as any).result ?? (info as any).profile);
    const dataError =
      pickFirstNonEmptyString(data, ['errorMessage', 'error', 'error_msg', 'errorMsg']) ||
      pickFirstNonEmptyString(data, ['message', 'msg']);
    if (dataError && looksLikeErrorText(dataError)) return dataError;
  }

  return null;
}

function extractEmptyFaceAnalysisReason(raw: any): string | null {
  const normalized = normalizeCozeWorkflowOutput(raw);
  if (!normalized || typeof normalized !== 'object') return null;

  if ('info' in (normalized as any) && (normalized as any).info == null) {
    const urls = (normalized as any).urls;
    const urlCount = Array.isArray(urls) ? urls.length : 0;
    return `工作流输出为空(info=null, urls=${urlCount})`;
  }

  return null;
}

function hasAnalysisFields(result: FaceAnalysisResult) {
  return isNonEmptyString(result.faceType) || isNonEmptyString(result.gender) || isNonEmptyString(result.userType);
}

function buildAnalysisResult(params: {
  executeId: string;
  faceType?: string;
  gender?: string;
  userType?: string;
  description?: string;
  package?: string;
  recommendedUrls?: string[];
  rawResult?: any;
}): FaceAnalysisResult {
  return {
    success: true,
    executeId: params.executeId,
    faceType: params.faceType,
    gender: params.gender,
    userType: params.userType,
    description: params.description,
    package: params.package,
    recommendedUrls: params.recommendedUrls,
    rawResult: params.rawResult,
  };
}

function parseFaceAnalysisOutput(output: any): FaceAnalysisResult | null {
  const normalizedOutput = normalizeCozeWorkflowOutput(output);
  if (!normalizedOutput) return null;

  const urlsCandidate =
    (normalizedOutput as any).urls ??
    (normalizedOutput as any).recommendedUrls ??
    (normalizedOutput as any).recommendedTemplateUrls;
  const urls = Array.isArray(urlsCandidate) ? urlsCandidate : [];

  // 兼容形态 1：{ info: { face_type, gender, age, desc, package }, urls: [] }
  if ((normalizedOutput as any).info) {
    const info = normalizeCozeWorkflowOutput((normalizedOutput as any).info);
    const result = buildAnalysisResult({
      executeId: '',
      faceType: pickFirstNonEmptyString(info, ['face_type', 'faceType', 'FaceType']),
      gender: pickFirstNonEmptyString(info, ['gender', 'Gender', 'sex', 'Sex']),
      userType:
        convertUserTypeToCode(pickFirstNonEmptyString(info, ['age', 'Age', 'UserType', 'userType', 'user_type'])) ||
        pickFirstNonEmptyString(info, ['age', 'Age', 'UserType', 'userType', 'user_type']),
      description: pickFirstNonEmptyString(info, ['desc', 'description', 'UserAppearanceDescription', 'userAppearanceDescription']),
      package: pickFirstNonEmptyString(info, ['package', 'Package']),
      recommendedUrls: urls,
      rawResult: normalizedOutput,
    });

    if (hasAnalysisFields(result)) return result;
  }

  // 兼容形态 2：{ info: { success: true, data: { gender, UserType, face_type, package, UserAppearanceDescription } }, urls: [] }
  const profile = parseUserProfileResult(normalizedOutput);
  if (profile.success) {
    return buildAnalysisResult({
      executeId: '',
      faceType: profile.faceType,
      gender: profile.gender,
      userType: profile.userType,
      description: profile.description,
      package: profile.package,
      recommendedUrls: profile.recommendedTemplateUrls || urls,
      rawResult: normalizedOutput,
    });
  }

  // 兼容形态 3：字段直接在顶层
  const flat = buildAnalysisResult({
    executeId: '',
    faceType: pickFirstNonEmptyString(normalizedOutput, ['face_type', 'faceType', 'FaceType']),
    gender: pickFirstNonEmptyString(normalizedOutput, ['gender', 'Gender', 'sex', 'Sex']),
    userType:
      convertUserTypeToCode(pickFirstNonEmptyString(normalizedOutput, ['userType', 'UserType', 'user_type', 'age', 'Age'])) ||
      pickFirstNonEmptyString(normalizedOutput, ['userType', 'UserType', 'user_type', 'age', 'Age']),
    description: pickFirstNonEmptyString(normalizedOutput, ['desc', 'description', 'UserAppearanceDescription', 'userAppearanceDescription']),
    package: pickFirstNonEmptyString(normalizedOutput, ['package', 'Package']),
    recommendedUrls: urls,
    rawResult: normalizedOutput,
  });
  if (hasAnalysisFields(flat)) return flat;

  return null;
}

// 调用 Coze 工作流（异步模式，需要轮询状态）
async function callCozeWorkflowAsync(workflowId: string, parameters: Record<string, any>): Promise<{ executeId: string }> {
  const config = await getCozeConfig();
  
  if (!config.apiKey) {
    throw new Error('Coze API Key 未配置，请在管理后台 API配置 中设置');
  }
  
  try {
    const response = await axios.post<CozeWorkflowResponse>(
      `${COZE_API_URL}/workflow/run`,
      {
        workflow_id: workflowId,
        parameters,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    if (response.data.code !== 0) {
      throw new Error(response.data.msg || 'Coze workflow call failed');
    }

    const executeId = response.data.execute_id;
    if (!executeId) {
      console.error('[Coze] No execute_id in response:', JSON.stringify(response.data));
      throw new Error('Coze workflow did not return execute_id');
    }
    
    console.log('[Coze] Workflow started, execute_id:', executeId);
    return { executeId };
  } catch (error: any) {
    console.error('[Coze] Workflow call error:', error.message);
    throw new Error(`Coze workflow call failed: ${error.message}`);
  }
}

// 调用 Coze 工作流（同步模式，直接返回结果）
async function callCozeWorkflowSync(workflowId: string, parameters: Record<string, any>): Promise<{ executeId: string; resultUrls: string[] }> {
  const config = await getCozeConfig();

  if (!config.apiKey) {
    throw new Error('Coze API Key 未配置，请在管理后台 API配置 中设置');
  }

  try {
    console.log('[Coze] Calling workflow sync:', workflowId);
    console.log('[Coze] Parameters:', JSON.stringify(parameters, null, 2));
    console.log('[Coze] Bot ID:', config.botId || '(not set)');

    // 构建请求体
    const requestBody: Record<string, any> = {
      workflow_id: workflowId,
      parameters,
    };

    // 如果配置了 bot_id，添加到请求体（某些工作流需要关联智能体）
    if (config.botId) {
      requestBody.bot_id = config.botId;
    }

    const response = await axios.post<CozeWorkflowResponse>(
      `${COZE_API_URL}/workflow/run`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000, // 2分钟超时，换脸可能需要较长时间
      }
    );

    console.log('[Coze] Response:', JSON.stringify(response.data, null, 2));

    if (response.data.code !== 0) {
      throw new Error(response.data.msg || 'Coze workflow call failed');
    }

    const executeId = response.data.execute_id || '';
    
    // 解析 data 字段中的结果
    let resultUrls: string[] = [];
    if (response.data.data) {
      try {
        const dataObj = JSON.parse(response.data.data);
        if (dataObj.output && Array.isArray(dataObj.output)) {
          resultUrls = dataObj.output;
        }
      } catch (e) {
        console.error('[Coze] Failed to parse data:', e);
      }
    }

    // 同步接口有时会返回空 output，但实际需要轮询获取结果
    if (executeId && resultUrls.length === 0) {
      console.warn('[Coze] Empty output from sync call, fallback to polling:', executeId);
      try {
        const pollResult = await waitForWorkflowCompletion(workflowId, executeId, {
          maxWaitTime: 180000,
          pollInterval: 2000,
        });

        if (pollResult.status === 'completed') {
          const parsed = parseFaceSwapResult(pollResult.output);
          if (parsed.success && parsed.resultUrls) {
            resultUrls = parsed.resultUrls;
          } else {
            console.warn('[Coze] Polling completed but no result urls:', parsed.errorMessage || 'unknown');
          }
        } else {
          console.warn('[Coze] Polling failed:', pollResult.error || 'unknown');
        }
      } catch (e: any) {
        console.error('[Coze] Polling error:', e?.message || e);
      }
    }
    
    console.log('[Coze] Workflow completed, execute_id:', executeId, 'resultUrls:', resultUrls);
    return { executeId, resultUrls };
  } catch (error: any) {
    console.error('[Coze] Workflow call error:', error.message);
    throw new Error(`Coze workflow call failed: ${error.message}`);
  }
}

// 查询工作流执行状态（用于异步模式）
export type WorkflowStatusResult = {
  status: 'running' | 'completed' | 'failed';
  output?: any;
  error?: string;
  rawStatus?: any;
  rawError?: any;
  rawHistory?: any;
  rawResponse?: any;
};

async function getWorkflowStatus(
  workflowId: string,
  executeId: string,
  options?: { includeRaw?: boolean }
): Promise<WorkflowStatusResult> {
  const config = await getCozeConfig();
  
  try {
    const response = await axios.get<any>(
      `${COZE_API_URL}/workflows/${workflowId}/run_histories/${executeId}`,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
        timeout: 10000,
      }
    );

    if (response.data?.code !== 0) {
      throw new Error(response.data?.msg || 'Failed to get workflow status');
    }

    const data = response.data?.data;
    const history = Array.isArray(data) ? data[0] : data;
    const rawStatus = history?.execute_status ?? history?.status ?? history?.executeStatus;
    const rawOutput = history?.output ?? history?.result?.output;
    const rawError = history?.error ?? history?.error_msg ?? history?.errorMessage;

    let status: 'running' | 'completed' | 'failed' = 'running';
    if (typeof rawStatus === 'string') {
      const normalized = rawStatus.toLowerCase();
      if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('cancel')) {
        status = 'failed';
      } else if (normalized.includes('success') || normalized.includes('complete') || normalized.includes('done')) {
        status = 'completed';
      }
    } else if (typeof rawStatus === 'number') {
      if (rawStatus === 2) status = 'completed';
      if (rawStatus === 3) status = 'failed';
      if (rawStatus === 1) status = 'running';
    }

    let output: any = undefined;
    if (rawOutput) {
      if (typeof rawOutput === 'string') {
        try {
          output = JSON.parse(rawOutput);
        } catch (e) {
          output = rawOutput;
        }
      } else {
        output = rawOutput;
      }
    }

    return {
      status,
      output,
      error: rawError,
      rawStatus: options?.includeRaw ? rawStatus : undefined,
      rawError: options?.includeRaw ? rawError : undefined,
      rawHistory: options?.includeRaw ? history : undefined,
      rawResponse: options?.includeRaw ? response.data : undefined,
    };
  } catch (error: any) {
    console.error('[Coze] Get status error:', error.message);
    throw new Error(`Failed to get workflow status: ${error.message}`);
  }
}

export async function getWorkflowStatusWithRaw(workflowId: string, executeId: string): Promise<WorkflowStatusResult> {
  return getWorkflowStatus(workflowId, executeId, { includeRaw: true });
}

// 单人换脸（同步模式，直接返回结果）
export async function faceSwapSingle(params: {
  userImageUrl: string;
  templateImageUrls: string[];
}): Promise<{ executeId: string; resultUrls: string[] }> {
  console.log('[Coze] faceSwapSingle called with params:', {
    userImageUrl: params.userImageUrl,
    templateImageUrls: params.templateImageUrls,
  });

  const config = await getCozeConfig();

  // 注意：template_image_url 必须是数组格式
  return callCozeWorkflowSync(config.singleFaceWorkflowId!, {
    image: params.userImageUrl,
    template_image_url: params.templateImageUrls, // 传递数组，不是单个字符串
  });
}

// 双人换脸（同步模式，直接返回结果）
export async function faceSwapCouple(params: {
  user1ImageUrl: string;  // 用户正脸照片
  user2ImageUrl: string;  // 好友正脸照片
  templateImageUrls: string[];  // 选中的模板数组
}): Promise<{ executeId: string; resultUrls: string[] }> {
  console.log('[Coze] faceSwapCouple called with params:', {
    user1ImageUrl: params.user1ImageUrl,
    user2ImageUrl: params.user2ImageUrl,
    templateImageUrls: params.templateImageUrls,
  });

  const config = await getCozeConfig();

  // 注意：template_image_url 必须是数组格式
  return callCozeWorkflowSync(config.doubleFaceWorkflowId!, {
    image1: params.user1ImageUrl,
    image2: params.user2ImageUrl,
    template_image_url: params.templateImageUrls, // 传递数组，不是单个字符串
  });
}

// 用户判别 - 识别性别、年龄类型、脸型（同步模式）
export async function analyzeUserFace(params: {
  userImageUrl: string;
}): Promise<FaceAnalysisResult> {
  const imageUrlForLog = redactUrlForLogs(params.userImageUrl);
  console.log('[Coze] analyzeUserFace called with params:', {
    userImageUrl: imageUrlForLog,
  });
  
  const config = await getCozeConfig();
  const workflowId = config.userAnalyzeWorkflowId!;
  
  if (!config.apiKey) {
    return {
      success: false,
      executeId: '',
      workflowId,
      errorMessage: 'Coze API Key 未配置，请在管理后台 API配置 中设置',
      errorCode: 'COZE_API_KEY_MISSING',
      retryable: false,
    };
  }
  
  try {
    const response = await axios.post<CozeWorkflowResponse>(
      `${COZE_API_URL}/workflow/run`,
      {
        workflow_id: workflowId,
        parameters: {
          image: params.userImageUrl,
          n_pics: 1,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30秒超时
      }
    );

    console.log('[Coze] analyzeUserFace response:', JSON.stringify(response.data, null, 2));

    if (response.data.code !== 0) {
      throw new Error(`[Coze] workflow/run failed (code=${response.data.code}): ${response.data.msg || 'unknown'}`);
    }

    const executeId = response.data.execute_id || '';
    let lastRawResult: any = undefined;
    let bestErrorMessage: string | null = null;

    let parsedResult: FaceAnalysisResult | null = null;
    // 解析 data 字段中的结果
    if (response.data.data) {
      try {
        const dataObj = JSON.parse(response.data.data);
        lastRawResult = dataObj;
        bestErrorMessage =
          bestErrorMessage || extractFaceAnalysisErrorMessage(dataObj) || extractEmptyFaceAnalysisReason(dataObj);
        parsedResult = parseFaceAnalysisOutput(dataObj);
        if (parsedResult) {
          parsedResult.executeId = executeId;
          parsedResult.workflowId = workflowId;
          if (hasAnalysisFields(parsedResult)) {
            return parsedResult;
          }
          console.warn('[Coze] analyzeUserFace output missing fields:', {
            executeId,
            workflowId,
            data: dataObj,
          });
        } else {
          console.warn('[Coze] analyzeUserFace output invalid:', {
            executeId,
            workflowId,
            data: dataObj,
          });
        }
      } catch (e) {
        console.error('[Coze] Failed to parse face analysis data:', e);
      }
    }

    // 同步接口返回空字段时，尝试轮询获取结果
    if (executeId) {
      try {
        const pollResult = await waitForWorkflowCompletion(workflowId, executeId, {
          maxWaitTime: 60000,
          pollInterval: 2000,
        });

        if (pollResult.status === 'completed') {
          lastRawResult = pollResult.output ?? lastRawResult;
          bestErrorMessage =
            bestErrorMessage ||
            extractFaceAnalysisErrorMessage(pollResult.output) ||
            extractEmptyFaceAnalysisReason(pollResult.output);
          const parsed = parseFaceAnalysisOutput(pollResult.output);
          if (parsed) {
            parsed.executeId = executeId;
            parsed.workflowId = workflowId;
            if (hasAnalysisFields(parsed)) {
              return parsed;
            }
            console.warn('[Coze] analyzeUserFace polling result missing fields:', {
              executeId,
              workflowId,
              output: pollResult.output,
            });
          }
        } else if (pollResult.status === 'failed') {
          return {
            success: false,
            executeId,
            workflowId,
            errorMessage: pollResult.error || '用户判别失败',
            rawResult: pollResult.output ?? lastRawResult,
            errorCode: 'COZE_WORKFLOW_FAILED',
            retryable: true,
          };
        }
      } catch (e: any) {
        console.error('[Coze] analyzeUserFace polling error:', e?.message || e);
      }
    }

    // 额外诊断：当工作流输出为空时，探测图片 URL 是否能被公网访问（仅失败路径触发）
    let urlProbe: UrlProbeResult | null = null;
    if (params.userImageUrl && /^https?:\/\//i.test(params.userImageUrl)) {
      urlProbe = await probeRemoteUrl(params.userImageUrl);
      console.warn('[Coze] analyzeUserFace image url probe:', {
        executeId,
        workflowId,
        url: imageUrlForLog,
        probe: urlProbe,
      });
      if (urlProbe && !urlProbe.ok && !bestErrorMessage) {
        bestErrorMessage = `图片URL访问失败: ${urlProbe.error}`;
      }
    }

    const inferredErrorCode =
      urlProbe && !urlProbe.ok ? 'IMAGE_URL_UNREACHABLE' : 'COZE_EMPTY_OUTPUT';

    return {
      success: false,
      executeId,
      workflowId,
      errorMessage: bestErrorMessage || '用户判别返回空结果（工作流未产出字段），请稍后重试或更换照片',
      rawResult: lastRawResult ?? parsedResult?.rawResult,
      errorCode: inferredErrorCode,
      retryable: inferredErrorCode !== 'IMAGE_URL_UNREACHABLE',
    };
  } catch (error: any) {
    console.error('[Coze] analyzeUserFace error:', error.message);
    return {
      success: false,
      executeId: '',
      workflowId: config.userAnalyzeWorkflowId!,
      errorMessage: error.message,
      errorCode: 'COZE_API_ERROR',
      retryable: true,
    };
  }
}

// 用户判别结果接口
export interface FaceAnalysisResult {
  success: boolean;
  executeId: string;
  workflowId?: string;
  faceType?: string;      // "宽脸" | "窄脸"
  gender?: string;        // "男" | "女"
  userType?: string;      // 新人群代码或中文（如 girl_young / 少女）
  description?: string;   // 详细描述
  package?: string;       // 推荐包
  recommendedUrls?: string[];
  rawResult?: any;
  errorCode?: string;
  retryable?: boolean;
  errorMessage?: string;
}

// 将中文脸型转换为数据库存储的英文值
export function convertFaceTypeToDb(faceType: string): 'wide' | 'narrow' | null {
  if (faceType === '宽脸' || faceType === 'wide') return 'wide';
  if (faceType === '窄脸' || faceType === 'narrow') return 'narrow';
  return null;
}

// 将数据库英文脸型转换为中文
export function convertFaceTypeFromDb(faceType: string | null): string | null {
  if (faceType === 'wide') return '宽脸';
  if (faceType === 'narrow') return '窄脸';
  return null;
}

// 将用户人群类型（中文/旧代码）转换为新的代码
const USER_TYPE_CODE_MAP: Record<string, string> = {
  // 新代码（保持不变）
  'girl_child': 'girl_child',
  'girl_young': 'girl_young',
  'woman_mature': 'woman_mature',
  'woman_elder': 'woman_elder',
  'boy_child': 'boy_child',
  'man_young': 'man_young',
  'man_elder': 'man_elder',
  // 中文（AI 输出）
  '幼女': 'girl_child',
  '少女': 'girl_young',
  '熟女': 'woman_mature',
  '奶奶': 'woman_elder',
  '幼男': 'boy_child',
  '少男': 'man_young',
  '大叔': 'man_elder',
  // 旧显示名
  '花季少女': 'girl_young',
  '熟龄姐姐': 'woman_mature',
  '元气哥哥': 'man_young',
  '睿智大叔': 'man_elder',
  '软萌女孩': 'girl_child',
  '儿童': 'boy_child',
  '长者': 'woman_elder',
  // 旧代码
  'shaonv': 'girl_young',
  'shunv': 'woman_mature',
  'yuanqigege': 'man_young',
  'ruizhidashu': 'man_elder',
  'ruanmengnvhai': 'girl_child',
  'ertong': 'boy_child',
  'laonian': 'woman_elder',
};

export function convertUserTypeToCode(userType?: string | null): string | null {
  if (!userType) return null;
  const trimmed = userType.trim();
  if (!trimmed) return null;
  return USER_TYPE_CODE_MAP[trimmed] ?? USER_TYPE_CODE_MAP[trimmed.toLowerCase()] ?? null;
}

// 获取工作流结果
export async function getWorkflowResult(executeId: string, workflowId?: string) {
  const config = await getCozeConfig();
  const workflowIds = workflowId
    ? [workflowId]
    : [config.singleFaceWorkflowId, config.doubleFaceWorkflowId].filter(Boolean);

  let lastError: Error | null = null;
  for (const id of workflowIds) {
    try {
      return await getWorkflowStatus(id!, executeId);
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to get workflow status');
}

// 解析用户判别结果
export interface UserProfileResult {
  success: boolean;
  gender?: string;
  userType?: string;
  faceType?: string;
  package?: string;
  description?: string;
  recommendedTemplateUrls?: string[];
  errorMessage?: string;
}

export function parseUserProfileResult(output: any): UserProfileResult {
  try {
    const normalizedOutput = normalizeCozeWorkflowOutput(output);
    if (!normalizedOutput) {
      return { success: false, errorMessage: '无输出结果' };
    }

    const info = normalizeCozeWorkflowOutput((normalizedOutput as any).info);
    const urls =
      (normalizedOutput as any).urls ??
      (normalizedOutput as any).recommendedTemplateUrls ??
      (normalizedOutput as any).recommendedUrls;

    if (!info) {
      return { success: false, errorMessage: '无输出结果' };
    }

    const successFlag = coerceSuccessFlag((info as any)?.success);
    if (successFlag !== true) {
      return { 
        success: false, 
        errorMessage: (info as any)?.msg || (info as any)?.message || '用户判别失败' 
      };
    }

    const data = normalizeCozeWorkflowOutput((info as any)?.data ?? (info as any)?.result ?? (info as any)?.profile ?? info);
    return {
      success: true,
      gender: pickFirstNonEmptyString(data, ['gender', 'Gender', 'sex', 'Sex']),
      userType:
        convertUserTypeToCode(pickFirstNonEmptyString(data, ['UserType', 'userType', 'user_type', 'age', 'Age'])) ||
        pickFirstNonEmptyString(data, ['UserType', 'userType', 'user_type', 'age', 'Age']),
      faceType: pickFirstNonEmptyString(data, ['face_type', 'faceType', 'FaceType']),
      package: pickFirstNonEmptyString(data, ['package', 'Package']),
      description: pickFirstNonEmptyString(data, ['UserAppearanceDescription', 'userAppearanceDescription', 'desc', 'description']),
      recommendedTemplateUrls: Array.isArray(urls) ? urls : undefined,
    };
  } catch (error: any) {
    return { 
      success: false, 
      errorMessage: `解析结果失败: ${error.message}` 
    };
  }
}

// 解析换脸结果
export interface FaceSwapResult {
  success: boolean;
  resultUrls?: string[];
  errorMessage?: string;
}

export function parseFaceSwapResult(output: any): FaceSwapResult {
  try {
    if (!output) {
      return { success: false, errorMessage: '无输出结果' };
    }

    const urls = output.output;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return { success: false, errorMessage: '未生成换脸图片' };
    }

    return {
      success: true,
      resultUrls: urls,
    };
  } catch (error: any) {
    return { 
      success: false, 
      errorMessage: `解析结果失败: ${error.message}` 
    };
  }
}

// 轮询等待工作流完成（用于异步模式）
export async function waitForWorkflowCompletion(
  workflowId: string,
  executeId: string,
  options?: {
    maxWaitTime?: number;  // 最大等待时间（毫秒），默认 180000 (3分钟)
    pollInterval?: number; // 轮询间隔（毫秒），默认 2000 (2秒)
    onProgress?: (progress: number) => void;
  }
): Promise<{ status: 'completed' | 'failed'; output?: any; error?: string }> {
  const maxWaitTime = options?.maxWaitTime || 180000;
  const pollInterval = options?.pollInterval || 2000;
  const startTime = Date.now();
  let progress = 0;

  while (Date.now() - startTime < maxWaitTime) {
    const result = await getWorkflowStatus(workflowId, executeId);

    if (result.status === 'completed') {
      options?.onProgress?.(100);
      return { status: 'completed' as const, output: result.output, error: result.error };
    }

    if (result.status === 'failed') {
      return { status: 'failed' as const, output: result.output, error: result.error };
    }

    // 模拟进度
    progress = Math.min(90, progress + Math.random() * 10);
    options?.onProgress?.(Math.floor(progress));

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return { 
    status: 'failed', 
    error: '工作流执行超时' 
  };
}

// 模拟 Coze 工作流（用于开发测试）
export async function mockFaceSwap(params: {
  userImageUrl: string;
  templateImageUrls: string[];
}): Promise<{ resultUrls: string[] }> {
  // 模拟处理延迟
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 返回模板图片作为结果（实际应该是换脸后的图片）
  return {
    resultUrls: params.templateImageUrls,
  };
}
