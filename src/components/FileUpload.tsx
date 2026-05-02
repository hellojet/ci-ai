import { Upload, App } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { uploadFile } from '@/api/upload';

const { Dragger } = Upload;

interface FileUploadProps {
  category: string;
  accept?: string;
  onSuccess: (url: string, filename: string) => void;
  children?: React.ReactNode;
}

export default function FileUpload({ category, accept, onSuccess, children }: FileUploadProps) {
  // 使用 App.useApp() 的 message，避免静态 message 无法继承 ConfigProvider 主题的告警
  const { message } = App.useApp();

  const handleUpload = async (options: { file: File; onSuccess?: () => void; onError?: (err: Error) => void }) => {
    try {
      const result = await uploadFile(options.file, category);
      onSuccess(result.url, result.filename);
      options.onSuccess?.();
      message.success('上传成功');
    } catch (error) {
      options.onError?.(error as Error);
      message.error((error as Error).message || '上传失败');
    }
  };

  if (children) {
    return (
      <Upload
        customRequest={handleUpload as never}
        accept={accept}
        showUploadList={false}
      >
        {children}
      </Upload>
    );
  }

  return (
    <Dragger
      customRequest={handleUpload as never}
      accept={accept}
      showUploadList={false}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
    </Dragger>
  );
}
