import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Typography,
  Empty,
  Spin,
  Popconfirm,
  message,
  Row,
  Col,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import * as projectApi from '@/api/projects';
import { useLocale } from '@/hooks/useLocale';
import { useAssetStore } from '@/stores/assetStore';
import type { Project } from '@/types/project';
import { formatRelativeTime } from '@/utils/formatters';

const { Title, Text, Paragraph } = Typography;

export default function ProjectListPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { styles, fetchStyles } = useAssetStore();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const result = await projectApi.getProjects({ page: 1, page_size: 50 });
      setProjects(result.items);
      setTotal(result.total);
    } catch {
      message.error(t('projectList.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchStyles();
  }, [fetchProjects, fetchStyles]);

  const handleCreate = async (values: { name: string; description?: string; style_id?: number; shots_per_image?: number }) => {
    try {
      await projectApi.createProject(values);
      message.success(t('projectList.createSuccess'));
      setCreateModalOpen(false);
      form.resetFields();
      fetchProjects();
    } catch (error) {
      message.error((error as Error).message || t('projectList.createFailed'));
    }
  };

  const handleDelete = async (projectId: number) => {
    try {
      await projectApi.deleteProject(projectId);
      message.success(t('projectList.deleteSuccess'));
      fetchProjects();
    } catch (error) {
      message.error((error as Error).message || t('projectList.deleteFailed'));
    }
  };

  const statusColorMap: Record<string, string> = {
    draft: 'default',
    in_progress: 'processing',
    completed: 'success',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#fff' }}>
            {t('projectList.title')}
          </Title>
          <Text type="secondary">{t('projectList.projectCount', { count: total })}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setCreateModalOpen(true)}>
          {t('projectList.newProject')}
        </Button>
      </div>

      <Spin spinning={loading}>
        {projects.length === 0 && !loading ? (
          <Empty
            description={<Text type="secondary">{t('projectList.noProjects')}</Text>}
            style={{ marginTop: 100 }}
          >
            <Button type="primary" onClick={() => setCreateModalOpen(true)}>
              {t('projectList.createProject')}
            </Button>
          </Empty>
        ) : (
          <Row gutter={[16, 16]}>
            {projects.map((project) => (
              <Col key={project.id} xs={24} sm={12} lg={8} xl={6}>
                <Card
                  hoverable
                  onClick={() => navigate(`/projects/${project.id}`)}
                  style={{
                    background: '#141414',
                    borderColor: '#1e1e1e',
                    height: '100%',
                  }}
                  styles={{ body: { padding: 20 } }}
                  actions={[
                    <Popconfirm
                      key="delete"
                      title={t('projectList.deleteConfirm')}
                      description={t('projectList.deleteDescription')}
                      onConfirm={(event) => {
                        event?.stopPropagation();
                        handleDelete(project.id);
                      }}
                      onCancel={(event) => event?.stopPropagation()}
                      okText={t('common.delete')}
                      okButtonProps={{ danger: true }}
                    >
                      <DeleteOutlined
                        style={{ color: '#666' }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </Popconfirm>,
                  ]}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <PlayCircleOutlined style={{ color: '#a855f7', fontSize: 18 }} />
                    <Title level={5} style={{ margin: 0, color: '#fff', flex: 1 }} ellipsis>
                      {project.name}
                    </Title>
                  </div>

                  {project.description && (
                    <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 12, fontSize: 13 }}>
                      {project.description}
                    </Paragraph>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    <Tag color={statusColorMap[project.status]}>{project.status}</Tag>
                    {project.style && (
                      <Tag color="purple">{project.style.name}</Tag>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#666', fontSize: 12 }}>
                    <ClockCircleOutlined />
                    <span>{formatRelativeTime(project.updated_at)}</span>
                    <span style={{ marginLeft: 'auto' }}>{t('projectList.by')} {project.creator?.username}</span>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      <Modal
        title={t('projectList.createTitle')}
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="name" label={t('projectList.projectName')} rules={[{ required: true, message: t('projectList.projectNameRequired') }]}>
            <Input placeholder={t('projectList.projectNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('projectList.description')}>
            <Input.TextArea placeholder={t('projectList.descriptionPlaceholder')} rows={3} />
          </Form.Item>
          <Form.Item name="style_id" label={t('projectList.visualStyle')}>
            <Select
              placeholder={t('projectList.stylePlaceholder')}
              allowClear
              options={styles.map((style) => ({ value: style.id, label: style.name }))}
            />
          </Form.Item>
          <Form.Item name="shots_per_image" label={t('projectList.imagesPerShot')} initialValue={2}>
            <InputNumber min={1} max={8} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button style={{ marginRight: 8 }} onClick={() => setCreateModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" htmlType="submit">
              {t('common.create')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
