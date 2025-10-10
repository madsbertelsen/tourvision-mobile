//
//  DomWebViewExtension.swift
//  tourvisionmobile
//
//  Custom extension to add menu items to the native iOS selection menu
//

import UIKit
import WebKit

// Extension to customize the edit menu for WKWebView
extension WKWebView {

    // Override buildMenu to add custom menu items
    @objc open override func buildMenu(with builder: UIMenuBuilder) {
        super.buildMenu(with: builder)

        // Only available on iOS 16+
        if #available(iOS 16.0, *) {
            // Create custom action for creating a geo-mark/location
            let createLocationAction = UIAction(
                title: "Create Location",
                image: UIImage(systemName: "location.circle.fill")
            ) { [weak self] _ in
                self?.handleCreateLocationAction()
            }

            // Create custom action for adding a note
            let addNoteAction = UIAction(
                title: "Add Note",
                image: UIImage(systemName: "note.text")
            ) { [weak self] _ in
                self?.handleAddNoteAction()
            }

            // Create a menu with our custom actions
            let customMenu = UIMenu(
                title: "",
                options: .displayInline,
                children: [createLocationAction, addNoteAction]
            )

            // Insert our custom menu after the standard edit menu
            builder.insertSibling(customMenu, afterMenu: .standardEdit)
        }
    }

    // Handle the "Create Location" action
    private func handleCreateLocationAction() {
        // Get the selected text from the WebView
        self.evaluateJavaScript("""
            (function() {
                const selection = window.getSelection();
                const selectedText = selection.toString();
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                return {
                    text: selectedText,
                    rect: {
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height
                    }
                };
            })()
        """) { result, error in
            if let data = result as? [String: Any],
               let selectedText = data["text"] as? String {
                // Send message to JavaScript to handle the action
                self.sendMessageToJavaScript(action: "createLocation", data: [
                    "selectedText": selectedText,
                    "rect": data["rect"] ?? [:]
                ])
            }
        }
    }

    // Handle the "Add Note" action
    private func handleAddNoteAction() {
        // Get the selected text from the WebView
        self.evaluateJavaScript("window.getSelection().toString()") { result, error in
            if let selectedText = result as? String {
                // Send message to JavaScript to handle the action
                self.sendMessageToJavaScript(action: "addNote", data: [
                    "selectedText": selectedText
                ])
            }
        }
    }

    // Helper method to send messages to JavaScript
    private func sendMessageToJavaScript(action: String, data: [String: Any]) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: [
                "source": "nativeMenu",
                "action": action,
                "data": data
            ], options: [])

            if let jsonString = String(data: jsonData, encoding: .utf8) {
                // Escape the JSON string for JavaScript
                let escapedJson = jsonString
                    .replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "\"", with: "\\\"")
                    .replacingOccurrences(of: "\n", with: "\\n")
                    .replacingOccurrences(of: "\r", with: "\\r")

                // Post message to window
                let javascript = """
                    window.postMessage(JSON.parse("\(escapedJson)"), '*');
                """

                self.evaluateJavaScript(javascript) { result, error in
                    if let error = error {
                        print("[DomWebViewExtension] Error sending message to JavaScript: \(error)")
                    } else {
                        print("[DomWebViewExtension] Successfully sent \(action) message to JavaScript")
                    }
                }
            }
        } catch {
            print("[DomWebViewExtension] Error creating JSON message: \(error)")
        }
    }
}