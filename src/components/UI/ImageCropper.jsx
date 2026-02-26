import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { useToast } from '../../context/ToastContext';
import './ImageCropper.css';

const ImageCropper = ({ image, onCropComplete, onCancel }) => {
  const toast = useToast();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropChange = useCallback((crop) => {
    setCrop(crop);
  }, []);

  const onZoomChange = useCallback((zoom) => {
    setZoom(zoom);
  }, []);

  const onCropCompleteCallback = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (imageSrc, pixelCrop) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve) => {
      // Try WebP first, fallback to JPEG if not supported
      const supportsWebP = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
      const mimeType = supportsWebP ? 'image/webp' : 'image/jpeg';
      const quality = supportsWebP ? 0.9 : 0.95;
      
      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Canvas is empty');
          return;
        }
        resolve(blob);
      }, mimeType, quality);
    });
  };

  const handleSave = async () => {
    try {
      const croppedImage = await getCroppedImg(image, croppedAreaPixels);
      onCropComplete(croppedImage);
    } catch (error) {
      console.error('Error cropping image:', error);
      toast.error('Failed to crop image. Please try again.');
    }
  };

  return (
    <div className="image-cropper-modal">
      <div className="image-cropper-backdrop" onClick={onCancel} />
      <div className="image-cropper-container">
        <div className="image-cropper-header">
          <h3>CROP IMAGE</h3>
          <button className="cropper-close-btn" onClick={onCancel}>×</button>
        </div>
        <div className="image-cropper-content">
          <div className="crop-container">
            <Cropper
              image={image}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropCompleteCallback}
            />
          </div>
          <div className="cropper-controls">
            <div className="control-group">
              <label>ZOOM</label>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="zoom-slider"
              />
              <span className="zoom-value">{zoom.toFixed(1)}x</span>
            </div>
          </div>
        </div>
        <div className="image-cropper-footer">
          <button className="cropper-cancel-btn" onClick={onCancel}>
            CANCEL
          </button>
          <button className="cropper-save-btn" onClick={handleSave}>
            SAVE CROPPED IMAGE
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropper;






