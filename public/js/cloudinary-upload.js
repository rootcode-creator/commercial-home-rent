window.cloudinaryDirectUpload = (() => {
  let directUploadPending = false;

  async function signUpload() {
    const res = await fetch('/cloudinary/sign');
    if (!res.ok) {
      throw new Error('Could not get Cloudinary signature');
    }
    return res.json();
  }

  async function uploadToCloudinary(file, onProgress) {
    const sign = await signUpload();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', sign.apiKey);
    formData.append('timestamp', sign.timestamp);
    formData.append('signature', sign.signature);
    formData.append('folder', sign.folder || 'wanderlust_DEV');
    const uploadUrl = `https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);
      xhr.responseType = 'json';

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && typeof onProgress === 'function') {
          onProgress(event.loaded / event.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const payload = xhr.response;
          resolve({
            url: payload.secure_url || payload.url,
            filename: payload.public_id,
          });
          return;
        }
        const text = xhr.responseText || 'Unknown error';
        reject(new Error(`Cloudinary upload failed: ${text}`));
      };

      xhr.onerror = () => reject(new Error('Cloudinary upload failed due to a network error.'));
      xhr.send(formData);
    });
  }

  function addHiddenField(form, name, value) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
    return input;
  }

  function clearMetadataFields(form, prefix) {
    const inputs = Array.from(form.querySelectorAll(`input[name^="${prefix}"]`));
    inputs.forEach((input) => input.remove());
  }

  function setListingMetadata(form, uploadedImages) {
    clearMetadataFields(form, 'listing[image]');
    clearMetadataFields(form, 'listing[images]');

    if (uploadedImages.length === 0) {
      return;
    }

    const primary = uploadedImages[0];
    addHiddenField(form, 'listing[image][url]', primary.url);
    addHiddenField(form, 'listing[image][filename]', primary.filename);

    uploadedImages.slice(1).forEach((img, index) => {
      addHiddenField(form, `listing[images][${index}][url]`, img.url);
      addHiddenField(form, `listing[images][${index}][filename]`, img.filename);
    });
  }

  function setProfileMetadata(form, image) {
    clearMetadataFields(form, 'profile[image]');
    if (!image) return;
    addHiddenField(form, 'profile[image][url]', image.url);
    addHiddenField(form, 'profile[image][filename]', image.filename);
  }

  async function uploadListingFiles(fileInput, form, onUploadComplete, onUploadProgress) {
    const files = Array.from(fileInput.files || []).slice(0, 3);
    if (!files.length) {
      return;
    }
    directUploadPending = true;
    try {
      const uploaded = [];
      for (const [index, file] of files.entries()) {
        const uploadedImage = await uploadToCloudinary(file, (progress) => {
          if (typeof onUploadProgress === 'function') {
            onUploadProgress({ index: index + 1, total: files.length, progress, name: file.name });
          }
        });
        uploaded.push(uploadedImage);
      }
      setListingMetadata(form, uploaded);
      if (typeof onUploadComplete === 'function') {
        onUploadComplete(uploaded);
      }
      if (fileInput.name) {
        fileInput.removeAttribute('name');
      }
    } finally {
      directUploadPending = false;
    }
  }

  async function uploadProfileFile(fileInput, form, onUploadComplete) {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    directUploadPending = true;
    try {
      const uploadedImage = await uploadToCloudinary(file);
      setProfileMetadata(form, uploadedImage);
      if (typeof onUploadComplete === 'function') {
        onUploadComplete(uploadedImage);
      }
      if (fileInput.name) {
        fileInput.removeAttribute('name');
      }
    } finally {
      directUploadPending = false;
    }
  }

  function attachListingFormSubmit(form, fileInput) {
    form.addEventListener('submit', (event) => {
      if (directUploadPending) {
        event.preventDefault();
        event.stopPropagation();
        alert('Please wait while image upload finishes.');
        return false;
      }

      const hasFiles = fileInput.files?.length > 0;
      const hasMetadata = form.querySelector('input[name="listing[image][url]"]');
      if (hasFiles && !hasMetadata) {
        event.preventDefault();
        event.stopPropagation();
        alert('Please wait for the image upload to finish before submitting.');
        return false;
      }
    }, false);
  }

  function attachProfileFormSubmit(form, fileInput) {
    form.addEventListener('submit', (event) => {
      if (directUploadPending) {
        event.preventDefault();
        event.stopPropagation();
        alert('Please wait while profile image upload finishes.');
        return false;
      }
    }, false);
  }

  return {
    initListingUploader: ({ formId, fileInputId, onUploadComplete, onUploadProgress, onUploadError }) => {
      const form = document.getElementById(formId);
      const fileInput = document.getElementById(fileInputId);
      if (!form || !fileInput) return;
      fileInput.addEventListener('change', async () => {
        try {
          await uploadListingFiles(fileInput, form, onUploadComplete, onUploadProgress);
        } catch (error) {
          if (typeof onUploadError === 'function') {
            onUploadError(error);
          } else {
            console.error(error);
          }
        }
      });
      attachListingFormSubmit(form, fileInput);
    },
    initProfileUploader: ({ formId, fileInputId, onUploadComplete }) => {
      const form = document.getElementById(formId);
      const fileInput = document.getElementById(fileInputId);
      if (!form || !fileInput) return;
      fileInput.addEventListener('change', () => uploadProfileFile(fileInput, form, onUploadComplete));
      attachProfileFormSubmit(form, fileInput);
    },
  };
})();
