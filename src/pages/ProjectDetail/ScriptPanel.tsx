import { useState } from 'react';
import { Input, Button, Space, Typography, Modal, Select, message, Alert } from 'antd';
import { ThunderboltOutlined, ScissorOutlined, SaveOutlined, EditOutlined } from '@ant-design/icons';
import { useProjectStore } from '@/stores/projectStore';
import * as scriptApi from '@/api/scripts';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ScriptPanelProps {
  projectId: number;
}

export default function ScriptPanel({ projectId }: ScriptPanelProps) {
  const { currentProject, isEditing, fetchProject } = useProjectStore();
  const script = currentProject?.script;
  const [content, setContent] = useState(script?.content || '');
  const [saving, setSaving] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateMode, setGenerateMode] = useState<'generate' | 'expand' | 'rewrite'>('generate');
  const [generating, setGenerating] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await scriptApi.updateScript(projectId, content);
      message.success('Script saved');
    } catch (error) {
      message.error((error as Error).message || 'Failed to save script');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await scriptApi.generateScript(projectId, {
        prompt: generatePrompt,
        mode: generateMode,
      });
      setContent(result.content);
      setGenerateModalOpen(false);
      setGeneratePrompt('');
      message.success('Script generated');
    } catch (error) {
      message.error((error as Error).message || 'Failed to generate script');
    } finally {
      setGenerating(false);
    }
  };

  const handleParse = async () => {
    if (!content.trim()) {
      message.warning('Please write or generate a script first');
      return;
    }
    setParsing(true);
    setParseWarnings([]);
    try {
      await handleSave();
      const result = await scriptApi.parseScript(projectId);
      if (result.warnings?.length > 0) {
        setParseWarnings(result.warnings);
      }
      await fetchProject(projectId);
      message.success(`Parsed into ${result.scenes.length} scenes`);
    } catch (error) {
      message.error((error as Error).message || 'Failed to parse script');
    } finally {
      setParsing(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#141414',
        borderRight: '1px solid #1e1e1e',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #1e1e1e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Title level={5} style={{ margin: 0, color: '#fff', fontSize: 14 }}>
          <EditOutlined style={{ marginRight: 6 }} />
          Script
        </Title>
        {script?.parsed && (
          <Text type="success" style={{ fontSize: 12 }}>
            Parsed ✓
          </Text>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <TextArea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write or paste your story script here..."
          disabled={!isEditing}
          style={{
            height: '100%',
            minHeight: 300,
            background: '#0c0c0c',
            borderColor: '#1e1e1e',
            color: '#ddd',
            resize: 'none',
          }}
        />
      </div>

      {parseWarnings.length > 0 && (
        <div style={{ padding: '0 12px 8px' }}>
          {parseWarnings.map((warning, index) => (
            <Alert key={index} message={warning} type="warning" showIcon closable style={{ marginBottom: 4 }} />
          ))}
        </div>
      )}

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #1e1e1e',
          display: 'flex',
          gap: 8,
        }}
      >
        <Space wrap style={{ width: '100%' }}>
          <Button
            icon={<SaveOutlined />}
            size="small"
            onClick={handleSave}
            loading={saving}
            disabled={!isEditing}
          >
            Save
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            size="small"
            onClick={() => setGenerateModalOpen(true)}
            disabled={!isEditing}
          >
            AI Generate
          </Button>
          <Button
            type="primary"
            icon={<ScissorOutlined />}
            size="small"
            onClick={handleParse}
            loading={parsing}
            disabled={!isEditing}
          >
            Parse Script
          </Button>
        </Space>
      </div>

      <Modal
        title="AI Script Generation"
        open={generateModalOpen}
        onCancel={() => setGenerateModalOpen(false)}
        onOk={handleGenerate}
        confirmLoading={generating}
        okText="Generate"
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              Mode
            </Text>
            <Select
              value={generateMode}
              onChange={setGenerateMode}
              style={{ width: '100%' }}
              options={[
                { value: 'generate', label: 'Generate New' },
                { value: 'expand', label: 'Expand Existing' },
                { value: 'rewrite', label: 'Rewrite' },
              ]}
            />
          </div>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              Prompt / Keywords
            </Text>
            <TextArea
              value={generatePrompt}
              onChange={(event) => setGeneratePrompt(event.target.value)}
              placeholder="e.g. A cyberpunk story about a rogue AI in Neo Shanghai..."
              rows={4}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
