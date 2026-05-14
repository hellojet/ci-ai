import { useEffect, useState, useCallback } from 'react';
import {
  Typography, Table, Button, Space, Tag, Input, Select, Drawer, Form, Popconfirm,
  App as AntApp,
} from 'antd';
import { SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  trialRequestsApi,
  type TrialRequestRecord,
  type TrialStatus,
} from '@/api/trialRequests';
import { formatDateTime } from '@/utils/formatters';
import { useLocale } from '@/hooks/useLocale';

const { Title, Text } = Typography;

const STATUS_COLOR: Record<TrialStatus, string> = {
  pending: 'gold',
  contacted: 'blue',
  approved: 'green',
  rejected: 'red',
};

interface DetailFormValues {
  status: TrialStatus;
  admin_notes: string;
}

export default function TrialRequestsPage() {
  const { t } = useLocale();
  const { message } = AntApp.useApp();
  const [items, setItems] = useState<TrialRequestRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<TrialStatus | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<TrialRequestRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<DetailFormValues>();

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trialRequestsApi.list({
        page,
        page_size: pageSize,
        status: statusFilter,
        keyword: keyword.trim() || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      message.error(t('trialAdmin.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, keyword, message, t]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openDetail = (record: TrialRequestRecord) => {
    setDetail(record);
    form.setFieldsValue({
      status: record.status,
      admin_notes: record.admin_notes ?? '',
    });
  };

  const handleSave = async () => {
    if (!detail) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      try {
        const updated = await trialRequestsApi.update(detail.id, {
          status: values.status,
          admin_notes: values.admin_notes || null,
        });
        setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
        message.success(t('trialAdmin.saveSuccess'));
        setDetail(null);
      } catch {
        message.error(t('trialAdmin.saveFailed'));
      } finally {
        setSaving(false);
      }
    } catch {
      // form validation error — handled by Antd
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await trialRequestsApi.delete(id);
      message.success(t('trialAdmin.deleteSuccess'));
      fetch();
    } catch {
      message.error(t('trialAdmin.deleteFailed'));
    }
  };

  const columns = [
    { title: t('trialAdmin.columnId'), dataIndex: 'id', key: 'id', width: 60 },
    { title: t('trialAdmin.columnName'), dataIndex: 'name', key: 'name' },
    {
      title: t('trialAdmin.columnEmail'),
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => <Text copyable={{ text: email }}>{email}</Text>,
    },
    {
      title: t('trialAdmin.columnCompany'),
      dataIndex: 'company',
      key: 'company',
      render: (company: string | null) => company || <span style={{ color: '#666' }}>—</span>,
    },
    {
      title: t('trialAdmin.columnStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (status: TrialStatus) => (
        <Tag color={STATUS_COLOR[status]}>{t(`trialAdmin.status${status[0].toUpperCase()}${status.slice(1)}`)}</Tag>
      ),
    },
    {
      title: t('trialAdmin.columnCreated'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (d: string) => formatDateTime(d),
    },
    {
      title: t('trialAdmin.columnActions'),
      key: 'actions',
      render: (_: unknown, record: TrialRequestRecord) => (
        <Space>
          <Button type="link" onClick={() => openDetail(record)}>
            {t('common.more')}
          </Button>
          <Popconfirm
            title={t('trialAdmin.deleteConfirm')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <Title level={3} style={{ color: '#fff', margin: 0 }}>
          {t('trialAdmin.title')}
        </Title>
        <Space wrap>
          <span style={{ color: '#888' }}>{t('trialAdmin.countLabel', { count: total })}</span>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('trialAdmin.searchPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => {
              setPage(1);
              fetch();
            }}
            style={{ width: 240 }}
          />
          <Select
            allowClear
            placeholder={t('trialAdmin.statusAll')}
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={[
              { value: 'pending', label: t('trialAdmin.statusPending') },
              { value: 'contacted', label: t('trialAdmin.statusContacted') },
              { value: 'approved', label: t('trialAdmin.statusApproved') },
              { value: 'rejected', label: t('trialAdmin.statusRejected') },
            ]}
          />
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={items}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
          showSizeChanger: true,
        }}
        locale={{ emptyText: t('trialAdmin.empty') }}
        style={{ background: '#141414' }}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={t('trialAdmin.detailTitle')}
        width={520}
        extra={
          <Button type="primary" loading={saving} onClick={handleSave}>
            {t('trialAdmin.save')}
          </Button>
        }
      >
        {detail && (
          <>
            <DescItem label={t('trialAdmin.columnId')} value={String(detail.id)} />
            <DescItem label={t('trialAdmin.columnName')} value={detail.name} />
            <DescItem label={t('trialAdmin.columnEmail')} value={detail.email} copyable />
            <DescItem label={t('trialAdmin.columnCompany')} value={detail.company || '—'} />
            <DescItem
              label={t('trialAdmin.fieldUseCase')}
              value={detail.use_case || '—'}
              multiline
            />
            <DescItem label={t('trialAdmin.fieldIp')} value={detail.ip || '—'} />
            <DescItem
              label={t('trialAdmin.fieldUserAgent')}
              value={detail.user_agent || '—'}
              multiline
            />
            <DescItem label={t('trialAdmin.columnCreated')} value={formatDateTime(detail.created_at)} />

            <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
              <Form.Item name="status" label={t('trialAdmin.columnStatus')}>
                <Select
                  options={[
                    { value: 'pending', label: t('trialAdmin.statusPending') },
                    { value: 'contacted', label: t('trialAdmin.statusContacted') },
                    { value: 'approved', label: t('trialAdmin.statusApproved') },
                    { value: 'rejected', label: t('trialAdmin.statusRejected') },
                  ]}
                />
              </Form.Item>
              <Form.Item name="admin_notes" label={t('trialAdmin.fieldNotes')}>
                <Input.TextArea rows={4} placeholder={t('trialAdmin.notesPlaceholder')} />
              </Form.Item>
            </Form>
          </>
        )}
      </Drawer>
    </div>
  );
}

function DescItem({
  label,
  value,
  copyable,
  multiline,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  multiline?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14, fontSize: 13 }}>
      <div style={{ color: '#888', marginBottom: 4 }}>{label}</div>
      <div
        style={{
          color: '#eee',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
          wordBreak: 'break-all',
        }}
      >
        {copyable ? <Text copyable={{ text: value }}>{value}</Text> : value}
      </div>
    </div>
  );
}
