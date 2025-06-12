import React, { useState, useEffect } from 'react';
import { TEXT_API } from '@/lib/api';

interface TextBoxEditorProps {
  textId: string;
}

const TextBoxEditor: React.FC<TextBoxEditorProps> = ({ textId }) => {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${TEXT_API}/text/${textId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.spec?.content?.value) {
          setValue(data.spec.content.value as string);
        }
      })
      .catch(() => {});
  }, [textId]);

  const saveText = async () => {
    setLoading(true);
    try {
      const payload = {
        textId,
        appId: 'demo',
        type: 'widget',
        name: 'Text Box',
        spec: {
          content: { format: 'plain', value },
        },
      };
      await fetch(`${TEXT_API}/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        className="w-full border rounded p-2 text-sm"
        rows={4}
        value={value}
        onChange={e => setValue(e.target.value)}
      />
      <button
        onClick={saveText}
        disabled={loading}
        className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
      >
        Save Text
      </button>
    </div>
  );
};

export default TextBoxEditor;
