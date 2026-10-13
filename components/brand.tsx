"use client";
import Image from "next/image";
import { useState } from "react";
export default function Brand() {
  const [missing, setMissing] = useState(false);
  return (
    <div className="brand">
      {!missing && (
        <Image
          unoptimized
          src="/adsn-logo.webp"
          width="148"
          height="54"
          alt="ADSN Solutions"
          onError={() => setMissing(true)}
        />
      )}{" "}
      {missing && (
        <span className="brand-text">
          ADSN<span> SOLUTIONS</span>
        </span>
      )}
    </div>
  );
}
