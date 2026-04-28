import { useEffect, useState } from 'react';
import { Tabs, Card, Button, Row, Col, Typography, Input, Empty, Spin, Modal, Form, message, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, UserOutlined, EnvironmentOutlined, FormatPainterOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { useLocale } from '@/hooks/useLocale';
import { useAssetStore } from '@/stores/assetStore';
import * as characterApi from '@/api/characters';
import * as environmentApi from '@/api/environments';
import * as styleApi from '@/api/styles';
import FileUpload from '@/components/FileUpload';
import { formatRelativeTime } from '@/utils/formatters';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

export default function AssetLibraryPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const {
    characters, environments, styles,
    charactersTotal, environmentsTotal, stylesTotal,
    loading, fetchCharacters, fetchEnvironments, fetchStyles,
  } = useAssetStore();
  const [keyword, setKeyword] = useState('');
  const [createType, setCreateType] = useState<'character' | 'environment' | 'style' | null>(null);
  const [form] = Form.useForm();
  const [seedImageUrl, setSeedImageUrl] = useState('');
  const [refImageUrl, setRefImageUrl] = useState('');

  useEffect(() => {
    fetchCharacters();
    fetchEnvironments();
    fetchStyles();
  }, [fetchCharacters, fetchEnvironments, fetchStyles]);

  const handleSearch = (value: string) => {
    setKeyword(value);
    fetchCharacters({ keyword: value });
    fetchEnvironments({ keyword: value });
  };

  const handleCreateCharacter = async (values: { name: string; description?: string; visual_prompt?: string }) => {
    try {
      const formData = new FormData();
      formData.append('name', values.name);
      if (values.description) formData.append('description', values.description);
      if (values.visual_prompt) formData.append('visual_prompt', values.visual_prompt);
      await characterApi.createCharacter(formData);
      message.success(t('assets.characterCreated'));
      setCreateType(null);
      form.resetFields();
      fetchCharacters();
    } catch (error) {
      message.error((error as Error).message || t('assets.characterCreateFailed'));
    }
  };

  const handleCreateEnvironment = async (values: { name: string; description?: string; prompt?: string }) => {
    try {
      const formData = new FormData();
      formData.append('name', values.name);
      if (values.description) formData.append('description', values.description);
      if (values.prompt) formData.append('prompt', values.prompt);
      await environmentApi.createEnvironment(formData);
      message.success(t('assets.environmentCreated'));
      setCreateType(null);
      form.resetFields();
      fetchEnvironments();
    } catch (error) {
      message.error((error as Error).message || t('assets.environmentCreateFailed'));
    }
  };

  const handleCreateStyle = async (values: { name: string; prompt: string }) => {
    try {
      const formData = new FormData();
      formData.append('name', values.name);
      formData.append('prompt', values.prompt);
      await styleApi.createStyle(formData);
      message.success(t('assets.styleCreated'));
      setCreateType(null);
      form.resetFields();
      fetchStyles();
    } catch (error) {
      message.error((error as Error).message || t('assets.styleCreateFailed'));
    }
  };

  const handleDeleteCharacter = async (characterId: number) => {
    try {
      await characterApi.deleteCharacter(characterId);
      message.success(t('assets.characterDeleted'));
      fetchCharacters();
    } catch (error) {
      message.error((error as Error).message || t('common.failed'));
    }
  };

  const handleDeleteEnvironment = async (environmentId: number) => {
    try {
      await environmentApi.deleteEnvironment(environmentId);
      message.success(t('assets.environmentDeleted'));
      fetchEnvironments();
    } catch (error) {
      message.error((error as Error).message || t('common.failed'));
    }
  };

  const handleDeleteStyle = async (styleId: number) => {
    try {
      await styleApi.deleteStyle(styleId);
      message.success(t('assets.styleDeleted'));
      fetchStyles();
    } catch (error) {
      message.error((error as Error).message || t('common.failed'));
    }
  };

  const tabItems = [
    {
      key: 'characters',
      label: (
        <span>
          <UserOutlined /> {t('assets.characters')} ({charactersTotal})
        </span>
      ),
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <Search placeholder={t('assets.searchPlaceholder')} onSearch={handleSearch} style={{ width: 300 }} allowClear />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateType('character')}>
              {t('assets.newCharacter')}
            </Button>
          </div>
          <Spin spinning={loading}>
            {characters.length === 0 ? (
              <Empty description={<Text type="secondary">{t('assets.noCharactersYet')}</Text>} />
            ) : (
              <Row gutter={[16, 16]}>
                {characters.map((char) => (
                  <Col key={char.id} xs={24} sm={12} lg={8} xl={6}>
                    <Card
                      hoverable
                      onClick={() => navigate(`/assets/characters/${char.id}`)}
                      style={{ background: '#141414', borderColor: '#1e1e1e' }}
                      cover={
                        (char.views?.[0]?.image_url || char.seed_image_url) ? (
                          <img src={char.views?.[0]?.image_url || char.seed_image_url} alt={char.name} style={{ height: 200, objectFit: 'cover', width: '100%' }} />
                        ) : (
                          <div style={{ height: 200, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <UserOutlined style={{ fontSize: 48, color: '#444' }} />
                          </div>
                        )
                      }
                      actions={[
                        <Popconfirm key="delete" title={t('assets.deleteConfirm')} onConfirm={(e) => { e?.stopPropagation(); handleDeleteCharacter(char.id); }} onCancel={(e) => e?.stopPropagation()}>
                          <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                        </Popconfirm>,
                      ]}
                    >
                      <Card.Meta
                        title={<Text style={{ color: '#fff' }}>{char.name}</Text>}
                        description={
                          <div>
                            {char.description && <Paragraph type="secondary" ellipsis={{ rows: 1 }} style={{ fontSize: 12, marginBottom: 4 }}>{char.description}</Paragraph>}
                            <Text type="secondary" style={{ fontSize: 11 }}>{char.views?.length || 0} views · {formatRelativeTime(char.updated_at)}</Text>
                          </div>
                        }
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Spin>
        </div>
      ),
    },
    {
      key: 'environments',
      label: (
        <span>
          <EnvironmentOutlined /> {t('assets.environments')} ({environmentsTotal})
        </span>
      ),
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <Search placeholder={t('assets.searchPlaceholder')} onSearch={handleSearch} style={{ width: 300 }} allowClear />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateType('environment')}>
              {t('assets.newEnvironment')}
            </Button>
          </div>
          <Spin spinning={loading}>
            {environments.length === 0 ? (
              <Empty description={<Text type="secondary">{t('assets.noEnvironmentsYet')}</Text>} />
            ) : (
              <Row gutter={[16, 16]}>
                {environments.map((env) => (
                  <Col key={env.id} xs={24} sm={12} lg={8} xl={6}>
                    <Card
                      hoverable
                      onClick={() => navigate(`/assets/environments/${env.id}`)}
                      style={{ background: '#141414', borderColor: '#1e1e1e' }}
                      cover={
                        env.base_image_url ? (
                          <img src={env.base_image_url} alt={env.name} style={{ height: 200, objectFit: 'cover', width: '100%' }} />
                        ) : (
                          <div style={{ height: 200, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <EnvironmentOutlined style={{ fontSize: 48, color: '#444' }} />
                          </div>
                        )
                      }
                      actions={[
                        <Popconfirm key="delete" title={t('assets.deleteConfirm')} onConfirm={(e) => { e?.stopPropagation(); handleDeleteEnvironment(env.id); }} onCancel={(e) => e?.stopPropagation()}>
                          <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                        </Popconfirm>,
                      ]}
                    >
                      <Card.Meta
                        title={<Text style={{ color: '#fff' }}>{env.name}</Text>}
                        description={<Text type="secondary" style={{ fontSize: 11 }}>{formatRelativeTime(env.updated_at)}</Text>}
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Spin>
        </div>
      ),
    },
    {
      key: 'styles',
      label: (
        <span>
          <FormatPainterOutlined /> {t('assets.styles')} ({stylesTotal})
        </span>
      ),
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateType('style')}>
              {t('assets.newStyle')}
            </Button>
          </div>
          <Spin spinning={loading}>
            {styles.length === 0 ? (
              <Empty description={<Text type="secondary">{t('assets.noStylesYet')}</Text>} />
            ) : (
              <Row gutter={[16, 16]}>
                {styles.map((style) => (
                  <Col key={style.id} xs={24} sm={12} lg={8} xl={6}>
                    <Card
                      hoverable
                      onClick={() => navigate(`/assets/styles/${style.id}`)}
                      style={{ background: '#141414', borderColor: '#1e1e1e' }}
                      cover={
                        style.reference_image_url ? (
                          <img src={style.reference_image_url} alt={style.name} style={{ height: 200, objectFit: 'cover', width: '100%' }} />
                        ) : (
                          <div style={{ height: 200, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FormatPainterOutlined style={{ fontSize: 48, color: '#444' }} />
                          </div>
                        )
                      }
                      actions={[
                        <Popconfirm key="delete" title={t('assets.deleteConfirm')} onConfirm={(e) => { e?.stopPropagation(); handleDeleteStyle(style.id); }} onCancel={(e) => e?.stopPropagation()}>
                          <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                        </Popconfirm>,
                      ]}
                    >
                      <Card.Meta
                        title={<Text style={{ color: '#fff' }}>{style.name}</Text>}
                        description={<Paragraph type="secondary" ellipsis={{ rows: 1 }} style={{ fontSize: 12 }}>{style.prompt}</Paragraph>}
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Spin>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ color: '#fff', marginBottom: 16 }}>
        {t('assets.title')}
      </Title>
      <Tabs items={tabItems} />

      {/* Create Character Modal */}
      <Modal title={t('assets.newCharacter')} open={createType === 'character'} onCancel={() => { setCreateType(null); form.resetFields(); setSeedImageUrl(''); }} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleCreateCharacter} style={{ marginTop: 16 }}>
          <Form.Item name="name" label={t('assets.name')} rules={[{ required: true }]}>
            <Input placeholder={t('assets.name')} />
          </Form.Item>
          <Form.Item name="description" label={t('assets.description')}>
            <Input.TextArea rows={2} placeholder={t('assets.description')} />
          </Form.Item>
          <Form.Item name="visual_prompt" label={t('assets.visualPrompt')}>
            <Input.TextArea rows={2} placeholder={t('assets.visualPrompt')} />
          </Form.Item>
          <Form.Item label={t('assets.seedImage')}>
            <FileUpload category="reference" accept="image/*" onSuccess={(url) => setSeedImageUrl(url)}>
              <Button>{seedImageUrl ? 'Change Image' : 'Upload Image'}</Button>
            </FileUpload>
            {seedImageUrl && <img src={seedImageUrl} alt="seed" style={{ marginTop: 8, maxWidth: 200, borderRadius: 6 }} />}
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Button style={{ marginRight: 8 }} onClick={() => setCreateType(null)}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit">{t('common.create')}</Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Environment Modal */}
      <Modal title={t('assets.newEnvironment')} open={createType === 'environment'} onCancel={() => { setCreateType(null); form.resetFields(); }} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleCreateEnvironment} style={{ marginTop: 16 }}>
          <Form.Item name="name" label={t('assets.name')} rules={[{ required: true }]}>
            <Input placeholder={t('assets.name')} />
          </Form.Item>
          <Form.Item name="description" label={t('assets.description')}>
            <Input.TextArea rows={2} placeholder={t('assets.description')} />
          </Form.Item>
          <Form.Item name="prompt" label={t('assets.prompt')}>
            <Input.TextArea rows={2} placeholder={t('assets.prompt')} />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Button style={{ marginRight: 8 }} onClick={() => setCreateType(null)}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit">{t('common.create')}</Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Style Modal */}
      <Modal title={t('assets.newStyle')} open={createType === 'style'} onCancel={() => { setCreateType(null); form.resetFields(); setRefImageUrl(''); }} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleCreateStyle} style={{ marginTop: 16 }}>
          <Form.Item name="name" label={t('assets.name')} rules={[{ required: true }]}>
            <Input placeholder={t('assets.name')} />
          </Form.Item>
          <Form.Item name="prompt" label={t('assets.prompt')} rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder={t('assets.prompt')} />
          </Form.Item>
          <Form.Item label={t('assets.referenceImage')}>
            <FileUpload category="reference" accept="image/*" onSuccess={(url) => setRefImageUrl(url)}>
              <Button>{refImageUrl ? 'Change Image' : 'Upload Image'}</Button>
            </FileUpload>
            {refImageUrl && <img src={refImageUrl} alt="ref" style={{ marginTop: 8, maxWidth: 200, borderRadius: 6 }} />}
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Button style={{ marginRight: 8 }} onClick={() => setCreateType(null)}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit">{t('common.create')}</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
