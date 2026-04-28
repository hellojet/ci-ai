export interface SystemSetting {
  key: string;
  value: string | number;
  updated_at: string;
}

export interface UpdateSettingsRequest {
  settings: { key: string; value: string | number }[];
}
