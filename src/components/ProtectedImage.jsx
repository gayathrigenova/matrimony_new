import { useEffect, useState } from "react";
import { fetchWithTokenRefresh } from "../api.js";

export default function ProtectedImage({ src, alt, className, style }) {
  const [blobUrl, setBlobUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) return undefined;
    let objectUrl = "";
    let active = true;
    fetchWithTokenRefresh(src)
      .then((response) => {
        if (!response.ok) throw new Error(`Image unavailable (HTTP ${response.status}).`);
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

  if (failed) return <span role="status">Image unavailable</span>;
  if (!blobUrl) return null;
  return <img src={blobUrl} alt={alt} className={className} style={style} />;
}
