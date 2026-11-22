import AppKit

struct WebKitPageBackdrop {
  var color: NSColor?
  var awaitingFirstPaint = false

  func layerColor(visible: Bool) -> CGColor? { visible ? color?.cgColor : nil }

  var pageDrawsBackground: Bool { !(awaitingFirstPaint && color != nil) }
}
