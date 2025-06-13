import React, { useEffect, useState } from 'react';
import { TEXT_API } from '@/lib/api';

interface TextBoxDisplayProps {
  textId: string;
}

const TextBoxDisplay: React.FC<TextBoxDisplayProps> = ({ textId }) => {
  const [content, setContent] = useState('');
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    fetch(`${TEXT_API}/text/${textId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.spec?.content?.value) {
          setContent(data.spec.content.value as string);
          setStyle({
            textAlign: data.spec.text_align,
            fontSize: data.spec.font_size,
            fontFamily: data.spec.font_family,
            color: data.spec.text_color,
          });
        }
      })
      .catch(() => {});
  }, [textId]);

  return (
    <div className="whitespace-pre-wrap w-full" style={style}>
      {content}
    </div>
  );
};

export default TextBoxDisplay;
