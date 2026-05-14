import { Modal, Form, Input, App as AntApp } from 'antd';
import { useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { trialRequestsApi, type TrialRequestPayload } from '@/api/trialRequests';
import { ApiError } from '@/api/client';

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

interface Props {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  name: string;
  email: string;
  company?: string;
  use_case?: string;
  website?: string; // honeypot
}

export default function TrialRequestModal({ open, onClose }: Props) {
  const { t } = useLocale();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: TrialRequestPayload = {
        name: values.name.trim(),
        email: values.email.trim(),
        company: values.company?.trim() || undefined,
        use_case: values.use_case?.trim() || undefined,
        website: values.website || undefined,
      };

      setLoading(true);
      try {
        await trialRequestsApi.submit(payload);
        message.success(t('landing.trialModal.successMsg'));
        form.resetFields();
        onClose();
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 429) {
          const text = err instanceof Error && /ip/i.test(err.message)
            ? t('landing.trialModal.tooManyMsg')
            : t('landing.trialModal.duplicateMsg');
          message.warning(text);
        } else if (status === 422) {
          // Antd Form 已经在前端校验过；后端 422 极少见，用通用错误提示
          message.error(t('landing.trialModal.errorMsg'));
        } else {
          message.error(t('landing.trialModal.errorMsg'));
        }
      } finally {
        setLoading(false);
      }
    } catch {
      // form 校验失败：Antd 会在字段下显示红字，不需要额外 toast
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => {
        if (!loading) {
          onClose();
        }
      }}
      onOk={handleSubmit}
      title={t('landing.trialModal.title')}
      okText={t('landing.trialModal.submit')}
      cancelText={t('landing.trialModal.cancel')}
      confirmLoading={loading}
      maskClosable={!loading}
      width={520}
      destroyOnHidden
    >
      <p style={{ color: '#aaa', marginBottom: 24, fontSize: 13 }}>
        {t('landing.trialModal.subtitle')}
      </p>
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          name="name"
          label={t('landing.trialModal.name')}
          rules={[{ required: true, message: t('landing.trialModal.nameRequired'), whitespace: true }]}
        >
          <Input placeholder={t('landing.trialModal.namePlaceholder')} maxLength={64} />
        </Form.Item>
        <Form.Item
          name="email"
          label={t('landing.trialModal.email')}
          rules={[
            { required: true, message: t('landing.trialModal.emailRequired') },
            {
              pattern: EMAIL_RE,
              message: t('landing.trialModal.emailInvalid'),
            },
          ]}
        >
          <Input placeholder={t('landing.trialModal.emailPlaceholder')} maxLength={255} />
        </Form.Item>
        <Form.Item name="company" label={t('landing.trialModal.company')}>
          <Input placeholder={t('landing.trialModal.companyPlaceholder')} maxLength={128} />
        </Form.Item>
        <Form.Item name="use_case" label={t('landing.trialModal.useCase')}>
          <Input.TextArea
            placeholder={t('landing.trialModal.useCasePlaceholder')}
            rows={3}
            maxLength={500}
            showCount
          />
        </Form.Item>

        {/* 蜜罐字段：视觉隐藏但保留在 DOM 中。机器人会填，正常用户看不到 */}
        <Form.Item
          name="website"
          label="Website"
          style={{
            position: 'absolute',
            left: '-9999px',
            top: '-9999px',
            height: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          <Input tabIndex={-1} autoComplete="off" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
