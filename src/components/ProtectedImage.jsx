import { useEffect, useState } from "react";

export default function ProtectedImage({ src, alt, className, style }) {
  const [blobUrl, setBlobUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) return undefined;
    let objectUrl = "";
    let active = true;
    fetch(src, {
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Image unavailable");
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed || !blobUrl) return null;
  return <img src={blobUrl} alt={alt} className={className} style={style} />;
}
