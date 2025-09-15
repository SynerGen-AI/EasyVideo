import React from "react";

interface ImagePreviewerProps {
  url: string | null;
  onClose: () => void;
}

const ImagePreviewer: React.FC<ImagePreviewerProps> = ({ url, onClose }) => {
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <img
        src={url}
        alt="预览"
        className="max-w-[90%] max-h-[90%] rounded shadow-lg"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="absolute top-4 right-4 text-white text-2xl"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
};

export default ImagePreviewer;