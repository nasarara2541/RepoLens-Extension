async function configureSidePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

void configureSidePanel().catch((error) => {
  console.error("RepoLens could not configure its side panel.", error);
});

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
});
