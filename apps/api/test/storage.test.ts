import { describe, expect, it } from "vitest";
import { cloudinaryAsset } from "../src/services/storage";

describe("cloudinaryAsset", () => {
  it("maps public raster images to image uploads without the extension", () => {
    expect(cloudinaryAsset("public/images/u1/abc-XYZ.png", "fz-craft")).toEqual({
      publicId: "fz-craft/public/images/u1/abc-XYZ",
      resourceType: "image",
      type: "upload",
      format: "png",
    });
  });

  it("makes private files authenticated so they need a signed URL", () => {
    const a = cloudinaryAsset("private/payments/u1/k.jpg", "fz-craft");
    expect(a.type).toBe("authenticated");
    expect(a.resourceType).toBe("image");
    expect(a.publicId).toBe("fz-craft/private/payments/u1/k");
  });

  it("stores SVG, PDF and text as raw assets keeping the extension", () => {
    expect(cloudinaryAsset("public/images/u1/a.svg", "fz-craft")).toEqual({ publicId: "fz-craft/public/images/u1/a.svg", resourceType: "raw", type: "upload" });
    expect(cloudinaryAsset("private/chat/u1/doc.pdf", "fz-craft").resourceType).toBe("raw");
  });

  it("handles an empty or slash-padded folder", () => {
    expect(cloudinaryAsset("public/qr/q.webp", "").publicId).toBe("public/qr/q");
    expect(cloudinaryAsset("public/qr/q.webp", "/brand/").publicId).toBe("brand/public/qr/q");
  });
});
