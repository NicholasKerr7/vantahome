const {
  concreteAdvisories,
  unexpectedAdvisories,
} = require("./check-dependency-security.js");

const acceptedAudit = {
  vulnerabilities: {
    "image-size": {
      via: [
        {
          title: "ICNS parser denial of service",
          url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
        },
        {
          title: "JXL and HEIF parser denial of service",
          url: "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
        },
      ],
    },
    metro: { via: ["image-size"] },
  },
};

describe("dependency security audit", () => {
  test("ignores npm's propagated dependency entries", () => {
    expect(concreteAdvisories(acceptedAudit)).toHaveLength(2);
    expect(unexpectedAdvisories(acceptedAudit)).toEqual([]);
  });

  test("fails a new concrete advisory", () => {
    const audit = {
      vulnerabilities: {
        ...structuredClone(acceptedAudit.vulnerabilities),
        postcss: {
          via: [
            {
              title: "New PostCSS issue",
              url: "https://github.com/advisories/GHSA-new-advisory",
            },
          ],
        },
      },
    };

    expect(unexpectedAdvisories(audit)).toEqual([
      expect.objectContaining({ dependency: "postcss" }),
    ]);
  });

  test("does not allow an accepted advisory URL on another package", () => {
    const audit = {
      vulnerabilities: {
        impostor: {
          via: [acceptedAudit.vulnerabilities["image-size"].via[0]],
        },
      },
    };

    expect(unexpectedAdvisories(audit)).toHaveLength(1);
  });
});
