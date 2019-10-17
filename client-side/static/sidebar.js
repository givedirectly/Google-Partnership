export {initializeSidebar};

const id = 'sidebar';
const toggleThresholdsId = 'sidebar-toggle-thresholds';
const toggleDatasetsId = 'sidebar-toggle-datasets';
const thresholdsId = 'sidebar-thresholds';
const datasetsId = 'sidebar-datasets';
const minWidth = '64px';
const expandedWidth = '25%';
const transitionDuration = 300;

// The id of the div containing the current sidebar content.
let currentContentId;

/**
 * Initializes the sidebar menu (i.e. the toggles to open various sidebars).
 */
function initializeSidebar() {
  document.getElementById(toggleThresholdsId).onclick = () => {
    toggleSidebar(toggleThresholdsId, thresholdsId);
  };
  document.getElementById(toggleDatasetsId).onclick = () => {
    toggleSidebar(toggleDatasetsId, datasetsId);
  };
}

/**
 * Toggles the appropriate sidebar view filled with the appropriate content.
 *
 * @param {string} toggleId the id of the div containing the toggle
 * @param {string} contentId the id of the div containing the new content
 */
function toggleSidebar(toggleId, contentId) {
  const sidebar = document.getElementById(id);

  if (currentContentId !== contentId) {
    if (currentContentId) {
      $('#' + currentContentId)
          .fadeOut(
              transitionDuration,
              () => $('#' + contentId).fadeIn(transitionDuration));
    } else {
      sidebar.style.width = expandedWidth;
      $('#' + contentId).fadeIn(transitionDuration);
    }
    currentContentId = contentId;
  } else {
    // Collapse the sidebar because the current content is being toggled off.
    sidebar.style.width = minWidth;
    $('#' + currentContentId).fadeOut(0);
    currentContentId = null;
  }
}
