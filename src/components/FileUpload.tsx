import { Upload, message } from 'antd';
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
  const handleUpload = async (options: { file: File; onSuccess?: () => void; onError?: (err: Error) => void }) => {
    try {
      const result = await uploadFile(options.file, category);
      onSuccess(result.url, result.filename);
      options.onSuccess?.();
      message.success('Upload successful');
    } catch (error) {
      options.onError?.(error as Error);
      message.error('Upload failed');
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
      <p className="ant-upload-text">Click or drag file to upload</p>
    </Dragger>
  );
}
