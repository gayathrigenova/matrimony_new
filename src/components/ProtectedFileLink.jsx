export default function ProtectedFileLink({ href, children }) {
  const openFile = async (event) => {
    event.preventDefault();
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const response = await fetch(href, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
      });
      if (!response.ok) throw new Error("Unable to open this file.");
      const blobUrl = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = blobUrl;
      else window.location.href = blobUrl;
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      if (tab) tab.close();
      window.alert("Unable to open this file. Please sign in again and retry.");
    }
  };

  return <a href={href} target="_blank" rel="noreferrer" onClick={openFile}>{children}</a>;
}
