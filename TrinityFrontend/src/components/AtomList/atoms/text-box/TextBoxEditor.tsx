import React, { useState, useEffect } from 'react';
import { TEXT_API } from '@/lib/api';
import { useLaboratoryStore, DEFAULT_TEXTBOX_SETTINGS } from '@/components/LaboratoryMode/store/laboratoryStore';

interface TextBoxEditorProps {
  textId: string;
}

const TextBoxEditor: React.FC<TextBoxEditorProps> = ({ textId }) => {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [exists, setExists] = useState(false);
  const atom = useLaboratoryStore(state => state.getAtom(textId));
  const settings = atom?.settings || DEFAULT_TEXTBOX_SETTINGS;

  useEffect(() => {
    fetch(`${TEXT_API}/text/${textId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.spec?.content?.value) {
          setValue(data.spec.content.value as string);
          setExists(true);
        } else {
          setValue(settings.content);
        }
      })
      .catch(() => {});
  }, [textId, settings.content]);

  const saveText = async () => {
    setLoading(true);
    try {
      const payload = {
        textId,
        appId: 'demo',
        type: 'widget',
        name: 'Text Box',
        spec: {
          content: { format: settings.format, value },
          allow_variables: settings.allow_variables,
          max_chars: settings.max_chars,
          text_align: settings.text_align,
          font_size: settings.font_size,
          font_family: settings.font_family,
          text_color: settings.text_color,
          headline: settings.headline,
          slide_layout: settings.slide_layout,
          transition_effect: settings.transition_effect,
          lock_content: settings.lock_content,
        },
      };
      const url = exists ? `${TEXT_API}/text/${textId}` : `${TEXT_API}/text`;
      const method = exists ? 'PUT' : 'POST';
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setExists(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 w-full">
      <textarea
        className="w-full border rounded p-2 text-sm block"
        rows={4}
        value={value}
        onChange={e => setValue(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          onClick={saveText}
          disabled={loading}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          Save Text
        </button>
      </div>
    </div>
  );
};

export default TextBoxEditor;
