// SPDX-License-Identifier: (BSD-3-Clause OR GPL-2.0-only)
// The public RSA regression vector below is from digitalbazaar/forge PR #1152,
// commit ceba34402e329f0365134f23fe19898756527d65, tests/unit/rsa.js.
// https://github.com/digitalbazaar/forge/pull/1152
// Copyright (c) 2010, Digital Bazaar, Inc. See ../security-patches/licenses/node-forge.LICENSE.
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const forge = require('node-forge');
const expoSigning = require('@expo/code-signing-certificates');

const invalidDigestInfo = /does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo/;
const message = Buffer.from('VantaHome dependency signature regression');
// Ephemeral test keys never leave this process and are not production credentials.
const nativeKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 3 });
const publicKeyPEM = nativeKeys.publicKey.export({ type: 'spki', format: 'pem' });
const privateKeyPEM = nativeKeys.privateKey.export({ type: 'pkcs1', format: 'pem' });
const keyPair = {
  publicKey: forge.pki.publicKeyFromPem(publicKeyPEM),
  privateKey: forge.pki.privateKeyFromPem(privateKeyPEM),
};

/** Return a fresh SHA-256 digest, since forge digest buffers are consumable. */
function digest() {
  return forge.md.sha256.create().update(message.toString('binary'));
}

/** Encode an ASN.1 DigestInfo with explicit algorithm parameters for parser tests. */
function digestInfo(parameters, extraOuterChildren = []) {
  const { asn1 } = forge;
  const algorithm = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes()),
    ...parameters,
  ]);
  return asn1.toDer(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    algorithm,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest().digest().getBytes()),
    ...extraOuterChildren,
  ])).getBytes();
}

/** Produce a correctly padded RSA block containing deliberately chosen DigestInfo bytes. */
function signEncodedDigestInfo(encoded) {
  const encodedBytes = Buffer.from(encoded, 'binary');
  const blockSize = nativeKeys.publicKey.asymmetricKeyDetails.modulusLength / 8;
  const paddingLength = blockSize - encodedBytes.length - 3;
  assert.ok(paddingLength >= 8, 'The regression must preserve valid PKCS#1 padding.');
  const paddedBlock = Buffer.concat([
    Buffer.from([0, 1]), Buffer.alloc(paddingLength, 0xff), Buffer.from([0]), encodedBytes,
  ]);
  return crypto.privateEncrypt({ key: nativeKeys.privateKey, padding: crypto.constants.RSA_NO_PADDING }, paddedBlock);
}

/** Build the legitimate optional NULL parameter without sharing a mutable ASN.1 tree. */
function nullParameter() {
  return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, '');
}

/** Build an extra unconsumed child that vulnerable forge treats as harmless padding. */
function nestedGarbage() {
  return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, 'untrusted padding');
}

test('rejects the upstream low-exponent nested DigestAlgorithm regression vector', () => {
  const modulus =
    'E932AC92252F585B3A80A4DD76A897C8B7652952FE788F6EC8DD640587A1EE56' +
    '47670A8AD4C2BE0F9FA6E49C605ADF77B5174230AF7BD50E5D6D6D6D28CCF0A8' +
    '86A514CC72E51D209CC772A52EF419F6A953F3135929588EBE9B351FCA61CED7' +
    '8F346FE00DBB6306E5C2A4C6DFC3779AF85AB417371CF34D8387B9B30AE46D7A' +
    '5FF5A655B8D8455F1B94AE736989D60A6F2FD5CADBFFBD504C5A756A2E6BB5CE' +
    'CC13BCA7503F6DF8B52ACE5C410997E98809DB4DC30D943DE4E812A47553DCE5' +
    '4844A78E36401D13F77DC650619FED88D8B3926E3D8E319C80C744779AC5D6AB' +
    'E252896950917476ECE5E8FC27D5F053D6018D91B502C4787558A002B9283DA7';
  const signature = Buffer.from(
    'a4ae63dd5e7712b78f4870d0f51e294df5503d4f16c5d27ae33370981fb57f0d' +
    'e49f50f3d6a04666774cd984cd13972db9bf8e12bd294ef0ddc916c7c86cbae6' +
    '3efd7b6b97885e69760c208a40f1aecc76a90d7af5145177efce1bb55807a8d0' +
    '5c20b1596753ba710642fc9acdde6c160232654662c77cc4466c8257a38edb49' +
    'f894e8845d0fd987b857ced88f4b62505a080bd87ef700d35d392a6e8f6fde34' +
    '250c50b86fae606cb551215e8f4813239b77651d5565ad453698c071d48c31e8' +
    'e526fb4a37610f64b3e1fb8e5be5898e408ad08197a0947794a530b54f844853' +
    '77ce4a7488ed485ce4e5e105dd89698a472f390c3b1b76bc16b73276c4d1c81d',
    'hex',
  );
  const publicKey = forge.pki.rsa.setPublicKey(new forge.jsbn.BigInteger(modulus, 16), new forge.jsbn.BigInteger('3'));
  const forgedMessage = Buffer.from('hello world!');
  const hash = forge.md.sha256.create().update(forgedMessage.toString('binary')).digest().getBytes();
  // Deliberately use default padding checks: the malformed nested sequence must be rejected itself.
  assert.throws(() => publicKey.verify(hash, signature.toString('binary')), invalidDigestInfo);
  assert.equal(crypto.verify('sha256', forgedMessage, forge.pki.publicKeyToPem(publicKey), signature), false);
});

for (const [label, parameters] of [
  ['OID, NULL, garbage', () => [nullParameter(), nestedGarbage()]],
  ['OID, garbage without NULL', () => [nestedGarbage()]],
  ['OID, duplicate NULL', () => [nullParameter(), nullParameter()]],
]) {
  test(`rejects extra algorithm children (${label}) just as OpenSSL does`, () => {
    const signature = signEncodedDigestInfo(digestInfo(parameters()));
    assert.throws(() => keyPair.publicKey.verify(digest().digest().getBytes(), signature.toString('binary')), invalidDigestInfo);
    assert.equal(crypto.verify('sha256', message, nativeKeys.publicKey, signature), false);
  });
}

test('preserves rejection of extra outer DigestInfo children', () => {
  const signature = signEncodedDigestInfo(digestInfo([nullParameter()], [nestedGarbage()]));
  assert.throws(() => keyPair.publicKey.verify(digest().digest().getBytes(), signature.toString('binary')), invalidDigestInfo);
});

for (const [label, parameters] of [
  ['present NULL', () => [nullParameter()]],
  ['omitted optional NULL', () => []],
]) {
  test(`continues accepting a valid SHA-256 DigestInfo with ${label}`, () => {
    const signature = signEncodedDigestInfo(digestInfo(parameters()));
    assert.equal(keyPair.publicKey.verify(digest().digest().getBytes(), signature.toString('binary')), true);
  });
}

for (const algorithm of ['sha256', 'sha384', 'sha512']) {
  test(`preserves valid ${algorithm} signatures and rejects changed messages`, () => {
    const md = forge.md[algorithm].create().update(message.toString('binary'));
    const signature = Buffer.from(keyPair.privateKey.sign(md), 'binary');
    assert.equal(keyPair.publicKey.verify(md.digest().getBytes(), signature.toString('binary')), true);
    assert.equal(crypto.verify(algorithm, message, nativeKeys.publicKey, signature), true);
    const wrong = forge.md[algorithm].create().update('different message').digest().getBytes();
    assert.equal(keyPair.publicKey.verify(wrong, signature.toString('binary')), false);
  });
}

test('preserves Expo certificate, CSR, and manifest-signature compatibility', () => {
  const now = Date.now();
  const certificate = expoSigning.generateSelfSignedCodeSigningCertificate({
    keyPair,
    validityNotBefore: new Date(now - 60_000),
    validityNotAfter: new Date(now + 3_600_000),
    commonName: 'VantaHome dependency regression fixture',
  });
  expoSigning.validateSelfSignedCertificate(certificate, keyPair);
  const certificatePEM = expoSigning.convertCertificateToCertificatePEM(certificate);
  const restoredCertificate = expoSigning.convertCertificatePEMToCertificate(certificatePEM);
  assert.equal(restoredCertificate.verify(restoredCertificate), true);
  const nativeCertificate = new crypto.X509Certificate(certificatePEM);
  assert.equal(nativeCertificate.verify(nativeKeys.publicKey), true);
  const signature = Buffer.from(expoSigning.signBufferRSASHA256AndVerify(keyPair.privateKey, certificate, message), 'base64');
  assert.equal(crypto.verify('sha256', message, nativeKeys.publicKey, signature), true);
  const csr = expoSigning.generateCSR(keyPair, 'VantaHome dependency regression fixture');
  const restoredCSR = expoSigning.convertCSRPEMToCSR(expoSigning.convertCSRToCSRPEM(csr));
  assert.equal(restoredCSR.verify(), true);
});
