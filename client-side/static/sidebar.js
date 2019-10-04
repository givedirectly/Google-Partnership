import {sidebarId, sidebarToggleThresholdsId, sidebarToggleDatasetsId, sidebarThresholdsId, sidebarDatasetsId} from './dom_constants.js';

export {initializeSidebar};

const sidebarMinWidth = '64px';
const sidebarExpandedWidth = '25%';

// The id of the div containing the current sidebar content.
let currentContentId;

/**
 * Initializes the sidebar menu (i.e. the toggles to open various sidebars).
 */
function initializeSidebar() {
  document.getElementById(sidebarToggleThresholdsId).onclick = () => {
    toggleSidebar(sidebarToggleThresholdsId, sidebarThresholdsId);
  };
  document.getElementById(sidebarToggleDatasetsId).onclick = () => {
    toggleSidebar(sidebarToggleDatasetsId, sidebarDatasetsId);
  };
}

/**
 * Toggles the appropriate sidebar view filled with the appropriate content.
 *
 * @param {string} toggleId the id of the div containing the toggle
 * @param {string} contentId the id of the div containing the new content
 */
function toggleSidebar(toggleId, contentId) {
  const sidebar = document.getElementById(sidebarId);

  // Clear the current content if one exists.
  if (currentContentId) {
    document.getElementById(currentContentId).style.opacity = 0;
  }

  if (currentContentId !== contentId) {
    // Expand the sidebar if it wasn't already expanded.
    sidebar.style.width = sidebarExpandedWidth;

    // Show the new content.
    document.getElementById(contentId).style.opacity = 1;
    currentContentId = contentId;
  } else {
    // Collapse the sidebar because the current content is being toggled off.
    sidebar.style.width = sidebarMinWidth;
    currentContentId = null;
  }
}
