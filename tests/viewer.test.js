import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewerDocument } from '../src/ui/viewer.js';

const shot = { kind: 'screenshot', mime: 'image/png', width: 800, height: 600, bytes: 1, capturedAt: '2026-11-24T00:00:00.000Z', blobKey: 'ev:1' };

test('pin is drawn at its stored fraction of the capture', () => {
  const html = viewerDocument({ src: 'blob:x', number: 3, title: 'Button', evidence: { ...shot, pin: { fx: 0.25, fy: 0.5 } } });
  assert.match(html, /class="pin" style="left:25\.00%;top:50\.00%"/);
  assert.match(html, />3<\/span>/);
});

test('no pin when the evidence has no stored position', () => {
  const html = viewerDocument({ src: 'blob:x', number: 1, title: 'Gif', evidence: { ...shot, kind: 'gif', mime: 'image/gif' } });
  assert.doesNotMatch(html, /class="pin"/);
});

test('pin position is clamped to the capture', () => {
  const html = viewerDocument({ src: 'blob:x', number: 1, title: 'T', evidence: { ...shot, pin: { fx: 1.4, fy: -0.2 } } });
  assert.match(html, /left:100\.00%;top:0\.00%/);
});

test('title is escaped in the caption and alt text', () => {
  const html = viewerDocument({ src: 'blob:x', number: 1, title: '<script>x</script>', evidence: shot });
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
});

test('uploaded images are labelled as not masked and get no pin', () => {
  const upload = { ...shot, kind: 'upload', mime: 'image/jpeg', name: 'a.jpg', pin: { fx: 0.5, fy: 0.5 } };
  const html = viewerDocument({ src: 'blob:x', number: 2, title: 'Photo', evidence: upload });
  assert.match(html, /Image not masked/);
  assert.match(html, /<img /);
});

test('uploaded videos render a video element', () => {
  const upload = { ...shot, kind: 'upload', mime: 'video/mp4', name: 'a.mp4' };
  const html = viewerDocument({ src: 'blob:x', number: 2, title: 'Clip', evidence: upload });
  assert.match(html, /<video src="blob:x" controls/);
});
