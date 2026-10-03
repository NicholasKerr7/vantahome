// SPDX-License-Identifier: (BSD-3-Clause OR GPL-2.0-only)
// Backport of digitalbazaar/forge PR #1152, commit
// ceba34402e329f0365134f23fe19898756527d65 (unmerged as of 2026-10-03).
// https://github.com/digitalbazaar/forge/pull/1152
// https://github.com/advisories/GHSA-86w9-cpqp-85rv
// Copyright (c) 2010, Digital Bazaar, Inc. See licenses/node-forge.LICENSE.
// Only lib/rsa.js changes; the published package version stays 1.4.0.

'use strict';

const originalBlock = `          // validate DigestInfo structure and element count
          var capture = {};
          var errors = [];
          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||
            obj.value.length !== 2) {
`;
const patchedBlock = `          // validate DigestInfo structure and element counts (outer DigestInfo
          // and nested DigestAlgorithm). asn1.validate ignores extra children,
          // so length must be checked explicitly at each nesting level to
          // prevent low-exponent PKCS#1 v1.5 signature forgery (CVE-2026-85393).
          var capture = {};
          var errors = [];
          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||
            obj.value.length !== 2 ||
            obj.value[0].value.length !==
              (('parameters' in capture) ? 2 : 1)) {
`;

module.exports = {
  name: 'node-forge',
  version: '1.4.0',
  advisory: 'GHSA-86w9-cpqp-85rv',
  files: [{
    path: 'lib/rsa.js',
    originalHash: 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50',
    patchedHash: 'acc22e5d36e27832c34e02dd3933aad7977d45b047eead5016520735efedc9c5',
    /** Reject unconsumed nested algorithm children, matching the pinned upstream fix. */
    patch(source) {
      if (source.split(originalBlock).length !== 2) {
        throw new Error('Expected exactly one original node-forge DigestInfo validator.');
      }
      return source.replace(originalBlock, patchedBlock);
    },
  }],
};
