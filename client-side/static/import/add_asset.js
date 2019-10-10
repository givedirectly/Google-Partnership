MultiFile.stream('https://ngsstormviewer.blob.core.windows.net/downloads/20170827_RGB.tar', (f) => {
  console.log(f.filename);
});
