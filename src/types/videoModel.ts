/**
 * 视频模型清单相关类型。
 *
 * 后端接口 GET /video-models 出于安全考虑只返回 id/label/display_name/protocol/is_default，
 * 真正的 endpoint 和 api_key 保留在后端环境变量 AI_VIDEO_MODELS 中。
 *
 * 展示名取值规则与图像模型一致：display_name > label > id，
 * 直接复用 `@/types/imageModel` 的 getModelDisplayName helper（结构兼容）。
 */

/** 当前后端只支持一种视频协议：dashscope 异步任务（submit + poll） */
export type VideoModelProtocol = 'dashscope_async_i2v';

export interface VideoModel {
  id: string;
  /** 技术展示名（如 "HappyHorse 1.0 I2V"） */
  label: string;
  /** 前端真正展示给用户的产品名/俗称（如 "快马 1.0"）。为空时回退到 label。 */
  display_name?: string | null;
  protocol: VideoModelProtocol;
  is_default: boolean;
}

export interface VideoModelListResponse {
  items: VideoModel[];
}
