import React, { useState, useRef, useCallback } from 'react';

const ImageCompressorApp = () => {
  const [originalImage, setOriginalImage] = useState(null);
  const [compressedImage, setCompressedImage] = useState(null);
  const [originalImageData, setOriginalImageData] = useState(null);
  const [compressedImageData, setCompressedImageData] = useState(null);
  const [targetSizeType, setTargetSizeType] = useState('MB');
  const [targetSize, setTargetSize] = useState(2);
  const [isCompressing, setIsCompressing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [compressionQuality, setCompressionQuality] = useState(0.8);
  
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get image dimensions
  const getImageDimensions = (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // Convert canvas to blob with specified quality
  const canvasToBlob = (canvas, quality, mimeType) => {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, mimeType, quality);
    });
  };

  // Calculate optimal dimensions to meet target file size
  const calculateOptimalDimensions = (originalWidth, originalHeight, targetBytes, quality) => {
    // Estimate compression ratio based on quality
    const baseCompressionRatio = quality * 0.3 + 0.1; // Rough estimate
    const originalPixels = originalWidth * originalHeight;
    const bytesPerPixel = 3; // Rough estimate for compressed image
    
    // Calculate target pixels based on target file size
    const targetPixels = targetBytes / (bytesPerPixel * baseCompressionRatio);
    
    if (targetPixels >= originalPixels) {
      return { width: originalWidth, height: originalHeight };
    }
    
    // Calculate scale factor while maintaining aspect ratio
    const scaleFactor = Math.sqrt(targetPixels / originalPixels);
    
    return {
      width: Math.floor(originalWidth * scaleFactor),
      height: Math.floor(originalHeight * scaleFactor)
    };
  };

  // Compress image using canvas
  const compressImageWithCanvas = async (file, targetSizeBytes, quality) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = async () => {
        // Calculate optimal dimensions
        const optimalDims = calculateOptimalDimensions(
          img.width, 
          img.height, 
          targetSizeBytes, 
          quality
        );

        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = optimalDims.width;
        canvas.height = optimalDims.height;

        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw and compress image
        ctx.drawImage(img, 0, 0, optimalDims.width, optimalDims.height);

        // Convert to blob with quality setting
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        
        try {
          let blob = await canvasToBlob(canvas, quality, mimeType);
          let currentQuality = quality;
          
          // If still too large, reduce quality further
          while (blob.size > targetSizeBytes && currentQuality > 0.1) {
            currentQuality -= 0.1;
            blob = await canvasToBlob(canvas, currentQuality, mimeType);
          }
          
          // If still too large, reduce dimensions
          if (blob.size > targetSizeBytes) {
            const scaleFactor = Math.sqrt(targetSizeBytes / blob.size);
            canvas.width = Math.floor(optimalDims.width * scaleFactor);
            canvas.height = Math.floor(optimalDims.height * scaleFactor);
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            blob = await canvasToBlob(canvas, currentQuality, mimeType);
          }

          resolve({
            blob,
            width: canvas.width,
            height: canvas.height,
            actualQuality: currentQuality
          });
        } catch (error) {
          console.error('Canvas compression error:', error);
          resolve({
            blob: file,
            width: img.width,
            height: img.height,
            actualQuality: quality
          });
        }
      };
      
      img.onerror = () => {
        resolve({
          blob: file,
          width: 0,
          height: 0,
          actualQuality: quality
        });
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  // Handle file selection
  const handleFileSelect = async (file) => {
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      alert('Please select a valid image file (JPG, PNG, or WEBP)');
      return;
    }

    try {
      const dimensions = await getImageDimensions(file);
      const imageUrl = URL.createObjectURL(file);
      
      setOriginalImage(imageUrl);
      setOriginalImageData({
        name: file.name,
        size: file.size,
        type: file.type,
        file: file,
        ...dimensions
      });
      setCompressedImage(null);
      setCompressedImageData(null);
    } catch (error) {
      console.error('Error processing image:', error);
    }
  };

  // Handle file input change
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    handleFileSelect(file);
  };

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  // Compress image
  const compressImage = async () => {
    if (!originalImageData) return;

    setIsCompressing(true);
    
    try {
      // Calculate target size in bytes
      const targetSizeInBytes = targetSizeType === 'MB' 
        ? targetSize * 1024 * 1024 
        : targetSize * 1024;

      // Compress the image
      const result = await compressImageWithCanvas(
        originalImageData.file,
        targetSizeInBytes,
        compressionQuality
      );

      const compressedFile = new File([result.blob], `compressed_${originalImageData.name}`, {
        type: result.blob.type
      });

      const compressedUrl = URL.createObjectURL(result.blob);

      setCompressedImage(compressedUrl);
      setCompressedImageData({
        name: compressedFile.name,
        size: result.blob.size,
        type: result.blob.type,
        file: compressedFile,
        width: result.width,
        height: result.height,
        actualQuality: result.actualQuality
      });
    } catch (error) {
      console.error('Error compressing image:', error);
      alert('Error compressing image. Please try again.');
    } finally {
      setIsCompressing(false);
    }
  };

  // Download compressed image
  const downloadCompressedImage = () => {
    if (!compressedImageData) return;

    const link = document.createElement('a');
    link.href = compressedImage;
    link.download = compressedImageData.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset app
  const resetApp = () => {
    setOriginalImage(null);
    setCompressedImage(null);
    setOriginalImageData(null);
    setCompressedImageData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Image Compressor</h1>
          <p className="text-gray-600">Compress your images while maintaining quality</p>
        </div>

        {/* Upload Section */}
        {!originalImage && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <div
              ref={dropRef}
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-all duration-200 ${
                dragActive 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="space-y-4">
                <div className="text-6xl text-gray-400">📸</div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">
                    Drop your image here or click to browse
                  </h3>
                  <p className="text-gray-500 mb-4">
                    Supports JPG, PNG, and WEBP files
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200"
                  >
                    Choose Image
                  </button>
                </div>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}

        {/* Image Processing Section */}
        {originalImage && (
          <div className="space-y-8">
            {/* Controls */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Compression Settings</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Target Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Size
                  </label>
                  <div className="flex">
                    <input
                      type="number"
                      value={targetSize}
                      onChange={(e) => setTargetSize(parseFloat(e.target.value) || 1)}
                      min="0.1"
                      step="0.1"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={targetSizeType}
                      onChange={(e) => setTargetSizeType(e.target.value)}
                      className="px-3 py-2 border border-l-0 border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="MB">MB</option>
                      <option value="KB">KB</option>
                    </select>
                  </div>
                </div>

                {/* Quality */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quality ({Math.round(compressionQuality * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={compressionQuality}
                    onChange={(e) => setCompressionQuality(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-end space-x-2">
                  <button
                    onClick={compressImage}
                    disabled={isCompressing}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
                  >
                    {isCompressing ? 'Compressing...' : 'Compress'}
                  </button>
                  <button
                    onClick={resetApp}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Image Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Original Image */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b">
                  <h3 className="text-lg font-semibold text-gray-800">Original Image</h3>
                </div>
                <div className="p-6">
                  <img
                    src={originalImage}
                    alt="Original"
                    className="w-full h-64 object-contain bg-gray-100 rounded-lg mb-4"
                  />
                  {originalImageData && (
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>File Size:</span>
                        <span className="font-medium">{formatFileSize(originalImageData.size)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Dimensions:</span>
                        <span className="font-medium">{originalImageData.width} × {originalImageData.height}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Format:</span>
                        <span className="font-medium">{originalImageData.type.split('/')[1].toUpperCase()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Compressed Image */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b">
                  <h3 className="text-lg font-semibold text-gray-800">Compressed Image</h3>
                </div>
                <div className="p-6">
                  {compressedImage ? (
                    <>
                      <img
                        src={compressedImage}
                        alt="Compressed"
                        className="w-full h-64 object-contain bg-gray-100 rounded-lg mb-4"
                      />
                      {compressedImageData && (
                        <div className="space-y-2 text-sm text-gray-600 mb-4">
                          <div className="flex justify-between">
                            <span>File Size:</span>
                            <span className="font-medium text-green-600">{formatFileSize(compressedImageData.size)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Dimensions:</span>
                            <span className="font-medium">{compressedImageData.width} × {compressedImageData.height}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Compression:</span>
                            <span className="font-medium text-green-600">
                              {Math.round((1 - compressedImageData.size / originalImageData.size) * 100)}% reduction
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Final Quality:</span>
                            <span className="font-medium">{Math.round(compressedImageData.actualQuality * 100)}%</span>
                          </div>
                        </div>
                      )}
                      <button
                        onClick={downloadCompressedImage}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
                      >
                        Download Compressed Image
                      </button>
                    </>
                  ) : (
                    <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                      {isCompressing ? (
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                          <p>Compressing image...</p>
                        </div>
                      ) : (
                        <p>Compressed image will appear here</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Compression Tips */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">💡 Compression Tips</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <strong>For smaller file sizes:</strong>
                  <ul className="mt-1 space-y-1">
                    <li>• Lower the quality setting</li>
                    <li>• Use JPEG for photos</li>
                    <li>• Set aggressive target sizes</li>
                  </ul>
                </div>
                <div>
                  <strong>For better quality:</strong>
                  <ul className="mt-1 space-y-1">
                    <li>• Keep quality above 70%</li>
                    <li>• Use PNG for graphics</li>
                    <li>• Set realistic target sizes</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageCompressorApp;