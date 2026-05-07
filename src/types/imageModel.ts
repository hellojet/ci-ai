/**
 * 图像模型清单相关类型。
 *
 * 后端接口 GET /image-models 出于安全考虑只返回 id/label/display_name/protocol/is_default，
 * 真正的 endpoint 和 api_key 保留在后端环境变量 AI_IMAGE_MODELS 中。
 */

export type ImageModelProtocol =
  | 'images_generations'
  | 'chat_completions_modalities';

export interface ImageModel {
  id: string;
  /** 技术展示名（保留兼容，比如 "Gemini 2.5 Flash Image"） */
  label: string;
  /** 前端真正展示给用户的产品名/俗称（如 "Nano Banana 2"）。为空时回退到 label。 */
  display_name?: string | null;
  protocol: ImageModelProtocol;
  is_default: boolean;
}

export interface ImageModelListResponse {
  items: ImageModel[];
}

/**
 * 统一的"模型展示名"取值规则：display_name > label > id。
 * 所有给用户看的下拉/标签都应该走这个 helper，避免各处重复拼装逻辑。
 */
export function getModelDisplayName(model: Pick<ImageModel, 'id' | 'label' | 'display_name'>): string {
  const trimmedDisplay = (model.display_name ?? '').trim();
  if (trimmedDisplay) return trimmedDisplay;
  if (model.label) return model.label;
  return model.id;
}
