import { useState, useEffect } from 'react';
import { Drawer, Form, Input, Select, Button, Typography, Space, Divider, Tag, message } from 'antd';
import { SaveOutlined, EyeOutlined } from '@ant-design/icons';
import type { Shot, PromptPreview } from '@/types/shot';
import { useProjectStore } from '@/stores/projectStore';
import { useAssetStore } from '@/stores/assetStore';
import { CAMERA_ANGLES } from '@/utils/constants';
import * as shotApi from '@/api/shots';
import ImageSelector from './ImageSelector';
import VideoSelector from './VideoSelector';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

interface ShotEditorProps {
  shot: Shot | null;
  projectId: number;
  open: boolean;
  onClose: () => void;
}

export default function ShotEditor({ shot, projectId, open, onClose }: ShotEditorProps) {
  const { updateShot, lockImage, lockVideo } = useProjectStore();
  const { characters, fetchCharacters } = useAssetStore();
  const [form] = Form.useForm();
  const [promptPreview, setPromptPreview] = useState<PromptPreview | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shot && open) {
      form.setFieldsValue({
        title: shot.title,
        narration: shot.narration,
        dialogue: shot.dialogue,
        subtitle: shot.subtitle,
        action_description: shot.action_description,
        camera_angle: shot.camera_angle,
        character_ids: shot.characters.map((char) => char.id),
      });
      fetchCharacters();
      fetchPrompt();
    }
  }, [shot?.id, open]);

  const fetchPrompt = async () => {
    if (!shot) return;
    setLoadingPrompt(true);
    try {
      const result = await shotApi.getShotPrompt(projectId, shot.id);
      setPromptPreview(result);
    } catch {
      // prompt preview may not be available yet
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleSave = async () => {
    if (!shot) return;
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      await updateShot(shot.id, values);
      message.success('镜头已更新');
      fetchPrompt();
    } catch (error) {
      message.error((error as Error).message || '更新镜头失败');
    } finally {
      setSaving(false);
    }
  };

  const handleLockImage = async (imageId: number) => {
    if (!shot) return;
    try {
      await lockImage(shot.id, imageId);
      message.success('图片已锁定');
    } catch (error) {
      message.error((error as Error).message || '锁定图片失败');
    }
  };

  const handleLockVideo = async (videoId: number) => {
    if (!shot) return;
    try {
      await lockVideo(shot.id, videoId);
      message.success('视频已锁定');
    } catch (error) {
      message.error((error as Error).message || '锁定视频失败');
    }
  };

  if (!shot) return null;

  return (
    <Drawer
      title={shot.title || '镜头编辑'}
      open={open}
      onClose={onClose}
      width={480}
      styles={{
        header: { background: '#141414', borderBottom: '1px solid #1e1e1e' },
        body: { background: '#0c0c0c', padding: 16 },
      }}
      extra={
        <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave} loading={saving}>
          保存
        </Button>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="标题">
          <Input placeholder="镜头标题" />
        </Form.Item>

        <Form.Item name="narration" label="旁白">
          <TextArea rows={2} placeholder="旁白文案..." />
        </Form.Item>

        <Form.Item name="dialogue" label="对白">
          <TextArea rows={2} placeholder="角色对白..." />
        </Form.Item>

        <Form.Item name="subtitle" label="字幕">
          <Input placeholder="字幕内容" />
        </Form.Item>

        <Form.Item name="action_description" label="动作描述">
          <TextArea rows={2} placeholder="描述镜头中的动作..." />
        </Form.Item>

        <Form.Item name="camera_angle" label="镜头角度">
          <Select
            placeholder="请选择镜头角度"
            allowClear
            options={CAMERA_ANGLES.map((angle) => ({ value: angle.value, label: angle.label }))}
          />
        </Form.Item>

        <Form.Item name="character_ids" label="角色">
          <Select
            mode="multiple"
            placeholder="请选择角色"
            options={characters.map((char) => ({ value: char.id, label: char.name }))}
          />
        </Form.Item>
      </Form>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* Image Selector */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
          候选图片（{shot.images.length}）
        </Text>
        <ImageSelector
          images={shot.images}
          lockedImageId={shot.locked_image_id}
          onLock={handleLockImage}
        />
      </div>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* Video Selector */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
          候选视频（{shot.videos?.length ?? 0}）
        </Text>
        <VideoSelector
          videos={shot.videos ?? []}
          lockedVideoId={shot.locked_video_id}
          onLock={handleLockVideo}
        />
      </div>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* Prompt Preview */}
      <div>
        <Space style={{ marginBottom: 8 }}>
          <EyeOutlined style={{ color: '#a855f7' }} />
          <Text strong style={{ color: '#fff' }}>
            生成提示词
          </Text>
          <Button type="link" size="small" onClick={fetchPrompt} loading={loadingPrompt}>
            刷新
          </Button>
        </Space>

        {promptPreview ? (
          <div style={{ background: '#141414', borderRadius: 6, padding: 12, border: '1px solid #1e1e1e' }}>
            <Paragraph style={{ color: '#ccc', fontSize: 12, marginBottom: 12 }}>{promptPreview.prompt}</Paragraph>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(promptPreview.components).map(
                ([key, value]) =>
                  value && (
                    <Tag key={key} color="purple" style={{ fontSize: 11 }}>
                      {key}: {value}
                    </Tag>
                  )
              )}
            </div>
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            保存镜头信息后可查看生成提示词预览
          </Text>
        )}
      </div>
    </Drawer>
  );
}
