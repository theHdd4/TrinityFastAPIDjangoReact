import React, { useEffect, useRef, useState } from 'react';

interface BackgroundVideoProps {
  hidden?: boolean;
}

const BackgroundVideo: React.FC<BackgroundVideoProps> = ({ hidden }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleReady = () => {
      setIsReady(true);
    };

    video.addEventListener('loadeddata', handleReady, { once: true });
    video.addEventListener('canplaythrough', handleReady, { once: true });

    return () => {
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('canplaythrough', handleReady);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (hidden) {
      video.pause();
      return;
    }

    if (isReady) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => {
          /* Ignore autoplay restrictions; video will play once allowed */
        });
      }
    }
  }, [hidden, isReady]);

  return (
    <div
      className={`absolute inset-0 -z-10 overflow-hidden transition-opacity duration-500 ${
        hidden ? 'opacity-0' : 'opacity-100'
      }`}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#1e1f23]/80 via-[#1f2024]/65 to-transparent"
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-[#1c1d21] transition-opacity duration-700 ${
          isReady ? 'opacity-0' : 'opacity-100'
        }`}
      />
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          isReady ? 'opacity-100' : 'opacity-0'
        }`}
        preload="auto"
        playsInline
        muted
        loop
        poster="/background.gif"
        tabIndex={-1}
      >
        <source src="/background.mp4" type="video/mp4" />
      </video>
    </div>
  );
};

export default BackgroundVideo;
