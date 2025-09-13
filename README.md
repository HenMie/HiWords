<div align="center">
	<h1>HiWords-Vocabulary Manager for Obsidian (Fork)</h1>
	<p><em>基于 <a href="https://github.com/CatMuse/HiWords">CatMuse/HiWords</a> 的个人定制版本</em></p>
</div>

---

A powerful Obsidian plugin that helps you expand your vocabulary while reading. It automatically highlights and translates unfamiliar words, making learning more efficient.

![Screenshot](https://github.com/user-attachments/assets/359f874d-299c-4dd6-9fa1-bacd4664fb42)

## ✨ Key Features

### 📚 Canvas Vocabulary Management

- **Canvas-based Vocabulary**: Use Obsidian Canvas files as vocabulary books with visual management
- **Multiple Vocabulary Books**: Create and manage multiple vocabulary collections for different topics
- **Flexible Word Organization**: Freely arrange vocabulary cards in Canvas with color categorization
- **Real-time Synchronization**: Automatic sync when vocabulary files are modified

### 🎯 Smart Word Highlighting

- **Automatic Highlighting**: Automatically identifies and highlights words from your vocabulary books
- **Color Mapping**: Sets highlight colors based on Canvas node colors
- **Real-time Updates**: Updates highlights when switching between files
- **Performance Optimization**: Uses CodeMirror 6 extensions for efficient processing of large documents

### 💡 Hover Definitions

- **Instant Translation**: View definitions by hovering over highlighted words
- **Markdown Support**: Definition content supports Markdown rendering
- **Elegant Interface**: Carefully designed popup interface with theme adaptation
- **Quick Access**: Access word explanations without leaving your current reading flow

### 📋 Sidebar Vocabulary List

- **Current Document Words**: Displays all vocabulary words appearing in the current document
- **Quick Navigation**: Click on words to jump to their locations in the document
- **Color Indicators**: Maintains visual consistency with highlight colors
- **Real-time Updates**: Automatically updates the vocabulary list as document content changes

### ⚡ Convenient Operations

- **Right-click to Add**: Quickly add selected text to vocabulary books via context menu
- **Command Palette**: Refresh vocabulary books or open the sidebar through the command palette

## 🚀 Quick Start

### Installing the Plugin

1. Download the plugin files to the `.obsidian/plugins/hi-words/` directory
2. Enable the HiWords plugin in Obsidian settings
3. Restart Obsidian

### Creating a Vocabulary Book

1. Create a new Canvas file (e.g., `vocabulary.canvas`)
2. Add text nodes in Canvas with the following format:
   ```
   word
   *alias1, alias2, alias3*

   definition or translation

   ```
3. Set different colors for vocabulary nodes to categorize them

### Configuring the Plugin

1. Open the plugin settings page
2. Add your Canvas files as vocabulary books
3. Enable automatic highlighting and hover display features
4. Start enjoying the smart vocabulary learning experience!

## 📖 Usage Guide

### Canvas Vocabulary Format

In Canvas, each vocabulary node should contain:
- **First line**: The word or phrase to learn
- **Definition section**: Word explanation, translation, or example sentences (supports Markdown)

Example:
```
serendipity
*alias1, alias2, alias3*
n. The ability to make fortunate discoveries by accident
Example: The discovery was pure serendipity.

```

### Highlight Color System

The plugin automatically maps Canvas node colors to corresponding highlight colors:

- 🔴 Red node → Red highlight
- 🟡 Yellow node → Yellow highlight
- 🟢 Green node → Green highlight
- 🔵 Blue node → Blue highlight
- 🟣 Purple node → Purple highlight
- ⚫ Gray node → Gray highlight

### Command List

- **Refresh Vocabulary** (`hi-words:refresh-vocabulary`)
  - Manually refresh all vocabulary book content
  - Use this command to immediately apply changes after modifying vocabulary books

- **Open Vocabulary List** (`hi-words:open-vocabulary-sidebar`)
  - Open the sidebar vocabulary list view
  - View all vocabulary words in the current document

## ⚙️ Settings Options

### Basic Settings

- **Enable Automatic Highlighting**: Automatically highlight words from vocabulary books while reading
- **Hover to Show Definition**: Display word definition popups on mouse hover

### Vocabulary Book Management

- **Add Vocabulary Book**: Select Canvas files as vocabulary books
- **Enable/Disable**: Control the activation status of specific vocabulary books
- **Remove Vocabulary Book**: Remove unwanted vocabulary books from configuration

## 👏 Credits & Support

本项目基于 [CatMuse/HiWords](https://github.com/CatMuse/HiWords) 进行个人定制开发。

如果你觉得原项目有用，请支持原作者：
- [Buy the original author a coffee on Ko-fi](https://ko-fi.com/catmuse)
- 给原项目一个 ⭐ star！

## 📝 个人定制说明

这是我基于原项目的个人定制版本，包含了一些适合我个人使用习惯的修改。如果你对原版感兴趣，请访问 [原项目](https://github.com/CatMuse/HiWords)。
