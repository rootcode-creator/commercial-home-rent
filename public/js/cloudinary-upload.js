window.cloudinaryDirectUpload = (() => {
  let directUploadPending = false;

  async function signUpload() {
    const res = await fetch('/cloudinary/sign');
    if (!res.ok) {
      throw new Error('Could not get Cloudinary signature');
    }
    return res.json();
  }

  async function uploadToCloudinary(file) {
    const sign = await signUpload();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', sign.apiKey);
    formData.append('timestamp', sign.timestamp);
    formData.append('signature', sign.signature);
    formData.append('folder', sign.folder || 'wanderlust_DEV');
    const uploadUrl = `https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cloudinary upload failed: ${text}`);
    }
    const payload = await response.json();
    return {
      url: payload.secure_url || payload.url,
      filename: payload.public_id,
    };
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

  function getUploadStatusElement(form) {
    return form.querySelector('.upload-status');
  }

  function updateStatus(form, message, statusClass = 'text-muted') {
    const statusEl = getUploadStatusElement(form);
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `upload-status small ${statusClass}`;
  }

  function setButtonState(button, enabled) {
    if (!button) return;
    button.disabled = !enabled;
    if (enabled) {
      button.classList.remove('upload-disabled');
    } else {
      button.classList.add('upload-disabled');
    }
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

  async function uploadListingFiles(fileInput, form, onUploadComplete) {
    const files = Array.from(fileInput.files || []).slice(0, 3);
    const submitButton = form.querySelector('button[type="submit"]');
    const hasFiles = files.length > 0;
    const hasMetadata = form.querySelector('input[name="listing[image][url]"]');

    if (!files.length) {
      updateStatus(form, 'No images selected.', 'text-muted');
      setButtonState(submitButton, !hasFiles || Boolean(hasMetadata));
      return;
    }

    directUploadPending = true;
    setButtonState(submitButton, false);
    updateStatus(form, `Uploading ${files.length} image${files.length > 1 ? 's' : ''}...`, 'text-primary');

    try {
      const uploaded = [];
      for (const file of files) {
        const uploadedImage = await uploadToCloudinary(file);
        uploaded.push(uploadedImage);
      }
      setListingMetadata(form, uploaded);
      if (typeof onUploadComplete === 'function') {
        onUploadComplete(uploaded);
      }
      if (fileInput.name) {
        fileInput.removeAttribute('name');
      }
      updateStatus(form, 'Upload complete. You can now submit the listing.', 'text-success');
    } catch (error) {
      console.error(error);
      updateStatus(form, 'Upload failed. Please reselect images and try again.', 'text-danger');
    } finally {
      directUploadPending = false;
      const hasMetadataAfter = form.querySelector('input[name="listing[image][url]"]');
      setButtonState(submitButton, Boolean(hasMetadataAfter) || !hasFiles);
    }
  }

  async function uploadProfileFile(fileInput, form, onUploadComplete) {
    const file = fileInput.files?.[0];
    const submitButton = form.querySelector('button[type="submit"]');
    if (!file) {
      updateStatus(form, 'No profile image selected.', 'text-muted');
      setButtonState(submitButton, true);
      return;
    }

    directUploadPending = true;
    setButtonState(submitButton, false);
    updateStatus(form, 'Uploading profile image...', 'text-primary');

    try {
      const uploadedImage = await uploadToCloudinary(file);
      setProfileMetadata(form, uploadedImage);
      if (typeof onUploadComplete === 'function') {
        onUploadComplete(uploadedImage);
      }
      if (fileInput.name) {
        fileInput.removeAttribute('name');
      }
      updateStatus(form, 'Profile image uploaded.', 'text-success');
    } catch (error) {
      console.error(error);
      updateStatus(form, 'Profile upload failed. Please retry.', 'text-danger');
    } finally {
      directUploadPending = false;
      const hasMetadataAfter = form.querySelector('input[name="profile[image][url]"]');
      setButtonState(submitButton, Boolean(hasMetadataAfter) || !file);
    }
  }

  function attachListingFormSubmit(form, fileInput) {
    form.addEventListener('submit', (event) => {
      if (directUploadPending) {
        event.preventDefault();
        event.stopPropagation();
        updateStatus(form, 'Please wait while image upload finishes.', 'text-danger');
        return false;
      }

      const hasFiles = fileInput.files?.length > 0;
      const hasMetadata = form.querySelector('input[name="listing[image][url]"]');
      if (hasFiles && !hasMetadata) {
        event.preventDefault();
        event.stopPropagation();
        updateStatus(form, 'Please wait for the image upload to finish before submitting.', 'text-danger');
        return false;
      }

      return true;
    }, false);
  }

  function attachProfileFormSubmit(form, fileInput) {
    form.addEventListener('submit', (event) => {
      if (directUploadPending) {
        event.preventDefault();
        event.stopPropagation();
        updateStatus(form, 'Please wait while profile image upload finishes.', 'text-danger');
        return false;
      }
      return true;
    }, false);
  }

  return {
    initListingUploader: ({ formId, fileInputId, onUploadComplete }) => {
      const form = document.getElementById(formId);
      const fileInput = document.getElementById(fileInputId);
      if (!form || !fileInput) return;
      fileInput.addEventListener('change', () => uploadListingFiles(fileInput, form, onUploadComplete));
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
