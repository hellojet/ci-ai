import { useEffect, useState } from 'react';
import { Typography, Table, Button, Modal, InputNumber, Input, Space, Tag, Select, Form, message } from 'antd';
import { DollarOutlined, UserOutlined, UserAddOutlined } from '@ant-design/icons';
import * as adminApi from '@/api/admin';
import type { User } from '@/types/user';
import { formatDateTime } from '@/utils/formatters';
import { useLocale } from '@/hooks/useLocale';

const { Title } = Typography;

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [creditDelta, setCreditDelta] = useState(0);
  const [creditReason, setCreditReason] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();
  const { t } = useLocale();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const result = await adminApi.getUsers({ page: 1, page_size: 100 });
      setUsers(result.items);
      setTotal(result.total);
    } catch {
      message.error(t('admin.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (values: { username: string; password: string; role: string; credits: number }) => {
    setCreateLoading(true);
    try {
      await adminApi.createUser(values);
      message.success(t('admin.createSuccess'));
      setCreateModalOpen(false);
      createForm.resetFields();
      fetchUsers();
    } catch (error) {
      message.error((error as Error).message || t('admin.createFailed'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenCreditModal = (user: User) => {
    setSelectedUser(user);
    setCreditDelta(0);
    setCreditReason('');
    setCreditModalOpen(true);
  };

  const handleUpdateCredits = async () => {
    if (!selectedUser || creditDelta === 0) return;
    try {
      await adminApi.updateUserCredits(selectedUser.id, creditDelta, creditReason);
      message.success(t('admin.creditSuccess', { action: t(creditDelta > 0 ? 'admin.added' : 'admin.deducted') }));
      setCreditModalOpen(false);
      fetchUsers();
    } catch (error) {
      message.error((error as Error).message || t('admin.creditFailed'));
    }
  };

  const columns = [
    {
      title: t('admin.user'),
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => (
        <Space>
          <UserOutlined />
          {username}
        </Space>
      ),
    },
    {
      title: t('admin.role'),
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'purple' : 'default'}>{role}</Tag>
      ),
    },
    {
      title: t('admin.credits'),
      dataIndex: 'credits',
      key: 'credits',
      render: (credits: number) => (
        <span style={{ color: '#faad14', fontWeight: 600 }}>⚡ {credits}</span>
      ),
    },
    {
      title: t('admin.created'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => formatDateTime(date),
    },
    {
      title: t('admin.actions'),
      key: 'actions',
      render: (_: unknown, record: User) => (
        <Button type="link" icon={<DollarOutlined />} onClick={() => handleOpenCreditModal(record)}>
          {t('admin.manageCredits')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ color: '#fff', margin: 0 }}>
          {t('admin.title')}
        </Title>
        <Space>
          <span style={{ color: '#888' }}>{t('admin.userCount', { count: total })}</span>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setCreateModalOpen(true)}>
            {t('admin.createUser')}
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={false}
        style={{ background: '#141414' }}
      />

      <Modal
        title={t('admin.creditModalTitle', { username: selectedUser?.username || '' })}
        open={creditModalOpen}
        onCancel={() => setCreditModalOpen(false)}
        onOk={handleUpdateCredits}
        okText={t('admin.update')}
        okButtonProps={{ disabled: creditDelta === 0 }}
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8, color: '#888' }}>
            {t('admin.currentBalance')} <span style={{ color: '#faad14' }}>⚡ {selectedUser?.credits}</span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, color: '#ccc' }}>{t('admin.amountLabel')}</label>
            <InputNumber
              value={creditDelta}
              onChange={(value) => setCreditDelta(value || 0)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, color: '#ccc' }}>{t('admin.reason')}</label>
            <Input
              value={creditReason}
              onChange={(event) => setCreditReason(event.target.value)}
              placeholder={t('admin.reasonPlaceholder')}
            />
          </div>
          {creditDelta !== 0 && (
            <div style={{ marginTop: 12, color: '#888' }}>
              {t('admin.newBalance')} <span style={{ color: '#faad14' }}>⚡ {(selectedUser?.credits || 0) + creditDelta}</span>
            </div>
          )}
        </div>
      </Modal>
      {/* 新增用户弹窗 */}
      <Modal
        title={t('admin.createUser')}
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateUser}
          initialValues={{ role: 'user', credits: 1000 }}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="username"
            label={t('admin.user')}
            rules={[{ required: true, message: t('admin.usernameRequired') }]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('admin.usernamePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('admin.password')}
            rules={[{ required: true, min: 6, message: t('admin.passwordRequired') }]}
          >
            <Input.Password placeholder={t('admin.passwordPlaceholder')} />
          </Form.Item>
          <Form.Item name="role" label={t('admin.role')}>
            <Select options={[{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }]} />
          </Form.Item>
          <Form.Item name="credits" label={t('admin.credits')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={createLoading}>
              {t('admin.createUser')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
