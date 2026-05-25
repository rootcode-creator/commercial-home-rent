(() => {
    'use strict'
  
    // Fetch all the forms we want to apply custom Bootstrap validation styles to
    const forms = document.querySelectorAll('.needs-validation')
  
      const profileInput = document.getElementById("profileImage");
      const profilePreview = document.querySelector(".profile-preview");
      if (profileInput && profilePreview) {
        profileInput.addEventListener("change", (event) => {
          const [file] = event.target.files || [];
          if (file) {
            profilePreview.src = URL.createObjectURL(file);
            profilePreview.classList.remove("d-none");
          } else {
            profilePreview.src = "";
            profilePreview.classList.add("d-none");
          }
        });
      }
  
    // Loop over them and prevent submission
    Array.from(forms).forEach(form => {
      form.addEventListener('submit', event => {
        if (!form.checkValidity()) {
          event.preventDefault()
          event.stopPropagation()
        }
  
        form.classList.add('was-validated')
      }, false)
    })
  })()