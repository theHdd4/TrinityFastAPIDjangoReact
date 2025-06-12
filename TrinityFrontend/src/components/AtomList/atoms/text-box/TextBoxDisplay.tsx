import React, { useEffect, useState } from 'react';
import { TEXT_API } from '@/lib/api';

interface TextBoxDisplayProps {
  textId: string;
}

const TextBoxDisplay: React.FC<TextBoxDisplayProps> = ({ textId }) => {
  const [content, setContent] = useState('');

  useEffect(() => {
    fetch(`${TEXT_API}/text/${textId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.spec?.content?.value) {
          setContent(data.spec.content.value as string);
        }
      })
      .catch(() => {});
  }, [textId]);

  return <div className="whitespace-pre-wrap w-full">{content}</div>;
};

export default TextBoxDisplay;
