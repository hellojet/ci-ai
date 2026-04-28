import { useState, useEffect } from 'react';
import { Drawer, Form, Input, Select, Button, Typography, Space, Divider, Tag, message } from 'antd';
import { SaveOutlined, EyeOutlined } from '@ant-design/icons';
import type { Shot, PromptPreview } from '@/types/shot';
import { useProjectStore } from '@/stores/projectStore';
import { useAssetStore } from '@/stores/assetStore';
import { CAMERA_ANGLES } from '@/utils/constants';
import * as shotApi from '@/api/shots';
import ImageSelector from './ImageSelector';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

interface ShotEditorProps {
  shot: Shot | null;
  projectId: number;
  open: boolean;
  onClose: () => void;
}

export default function ShotEditor({ shot, projectId, open, onClose }: ShotEditorProps) {
  const { updateShot, isEditing, lockImage } = useProjectStore();
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
      message.success('Shot updated');
      fetchPrompt();
    } catch (error) {
      message.error((error as Error).message || 'Failed to update shot');
    } finally {
      setSaving(false);
    }
  };

  const handleLockImage = async (imageId: number) => {
    if (!shot) return;
    try {
      await lockImage(shot.id, imageId);
      message.success('Image locked');
    } catch (error) {
      message.error((error as Error).message || 'Failed to lock image');
    }
  };

  if (!shot) return null;

  return (
    <Drawer
      title={shot.title || 'Shot Editor'}
      open={open}
      onClose={onClose}
      width={480}
      styles={{
        header: { background: '#141414', borderBottom: '1px solid #1e1e1e' },
        body: { background: '#0c0c0c', padding: 16 },
      }}
      extra={
        isEditing && (
          <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave} loading={saving}>
            Save
          </Button>
        )
      }
    >
      <Form form={form} layout="vertical" disabled={!isEditing}>
        <Form.Item name="title" label="Title">
          <Input placeholder="Shot title" />
        </Form.Item>

        <Form.Item name="narration" label="Narration">
          <TextArea rows={2} placeholder="Narration text..." />
        </Form.Item>

        <Form.Item name="dialogue" label="Dialogue">
          <TextArea rows={2} placeholder="Character dialogue..." />
        </Form.Item>

        <Form.Item name="subtitle" label="Subtitle">
          <Input placeholder="Subtitle text" />
        </Form.Item>

        <Form.Item name="action_description" label="Action Description">
          <TextArea rows={2} placeholder="Describe the action..." />
        </Form.Item>

        <Form.Item name="camera_angle" label="Camera Angle">
          <Select
            placeholder="Select camera angle"
            allowClear
            options={CAMERA_ANGLES.map((angle) => ({ value: angle.value, label: angle.label }))}
          />
        </Form.Item>

        <Form.Item name="character_ids" label="Characters">
          <Select
            mode="multiple"
            placeholder="Select characters"
            options={characters.map((char) => ({ value: char.id, label: char.name }))}
          />
        </Form.Item>
      </Form>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* Image Selector */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
          Candidate Images ({shot.images.length})
        </Text>
        <ImageSelector
          images={shot.images}
          lockedImageId={shot.locked_image_id}
          onLock={handleLockImage}
          isEditing={isEditing}
        />
      </div>

      <Divider style={{ borderColor: '#1e1e1e' }} />

      {/* Prompt Preview */}
      <div>
        <Space style={{ marginBottom: 8 }}>
          <EyeOutlined style={{ color: '#a855f7' }} />
          <Text strong style={{ color: '#fff' }}>
            Generated Prompt
          </Text>
          <Button type="link" size="small" onClick={fetchPrompt} loading={loadingPrompt}>
            Refresh
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
            Save shot details to generate prompt preview
          </Text>
        )}
      </div>
    </Drawer>
  );
}
