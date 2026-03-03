import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatErrorMessage } from '../../utils/error.js';
import { FeishuApiService } from '../../services/feishuApiService.js';
import { Logger } from '../../utils/logger.js';
import { detectMimeType } from '../../utils/document.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  MessageIdSchema,
  FileKeySchema,
  MessageResourceTypeSchema,
  MessageFileNameSchema,
  SavePathSchema,
} from '../../types/feishuSchema.js';

/**
 * 注册飞书消息相关的MCP工具
 * @param server MCP服务器实例
 * @param feishuService 飞书API服务实例
 */
export function registerFeishuMessageTools(server: McpServer, feishuService: FeishuApiService | null): void {
  // 获取飞书消息内容工具
  server.tool(
    'get_feishu_message_content',
    'Retrieves the content of a Feishu IM message by its message ID. Returns full message metadata including msg_type, sender, chat_id, create_time, and the body content (which contains file_key for file/image messages). Use this to inspect a message before downloading its attached resources.',
    {
      messageId: MessageIdSchema,
    },
    async ({ messageId }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration.' }],
          };
        }

        Logger.info(`开始获取飞书消息内容，消息ID: ${messageId}`);
        const result = await feishuService.getMessageContent(messageId);
        Logger.info(`飞书消息内容获取成功，消息ID: ${messageId}`);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        Logger.error(`获取飞书消息内容失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `获取飞书消息内容失败: ${errorMessage}` }],
        };
      }
    },
  );

  // 获取飞书消息资源文件工具
  server.tool(
    'get_feishu_message_resource',
    'Downloads a resource file (image or file) from a Feishu IM message. ' +
    'Workflow: (1) Use get_feishu_message_content to retrieve the message and extract file_key and file_name from the body content JSON. ' +
    '(2) Call this tool with the messageId, file_key, and the original file_name to download and save the file. ' +
    'For image messages (msg_type="image") use type="image"; for file messages (msg_type="file") use type="file". ' +
    'Returns image data as an inline image, or saves the file to disk and returns the saved file path with metadata.',
    {
      messageId: MessageIdSchema,
      fileKey: FileKeySchema,
      type: MessageResourceTypeSchema,
      fileName: MessageFileNameSchema,
      savePath: SavePathSchema,
    },
    async ({ messageId, fileKey, type = 'file', fileName, savePath }) => {
      try {
        if (!feishuService) {
          return {
            content: [{ type: 'text', text: 'Feishu service is not initialized. Please check the configuration.' }],
          };
        }

        Logger.info(`开始获取飞书消息资源，消息ID: ${messageId}，文件Key: ${fileKey}，类型: ${type}`);
        const fileBuffer = await feishuService.getMessageResource(messageId, fileKey, type);
        Logger.info(`飞书消息资源获取成功，大小: ${fileBuffer.length} 字节`);

        const mimeType = detectMimeType(fileBuffer);
        const isImage = mimeType.startsWith('image/');

        if (isImage) {
          // 图片类型：直接以 image 内容类型内联返回，并同时保存到磁盘
          const base64Data = fileBuffer.toString('base64');

          // 保存图片到磁盘
          const resolvedFileName = fileName || `${fileKey}.bin`;
          const resolvedDir = savePath || os.tmpdir();
          const resolvedFilePath = path.join(resolvedDir, resolvedFileName);
          fs.mkdirSync(resolvedDir, { recursive: true });
          fs.writeFileSync(resolvedFilePath, fileBuffer);
          Logger.info(`图片已保存到: ${resolvedFilePath}`);

          return {
            content: [
              {
                type: 'image',
                mimeType: mimeType,
                data: base64Data,
              },
              {
                type: 'text',
                text: JSON.stringify({
                  savedPath: resolvedFilePath,
                  fileName: resolvedFileName,
                  mimeType,
                  size: fileBuffer.length,
                }, null, 2),
              },
            ],
          };
        } else {
          // 非图片文件：写入磁盘，以原始文件名（含扩展名）保存
          const resolvedFileName = fileName || `${fileKey}.bin`;
          const resolvedDir = savePath || os.tmpdir();
          const resolvedFilePath = path.join(resolvedDir, resolvedFileName);

          fs.mkdirSync(resolvedDir, { recursive: true });
          fs.writeFileSync(resolvedFilePath, fileBuffer);
          Logger.info(`文件已保存到: ${resolvedFilePath}`);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  savedPath: resolvedFilePath,
                  fileName: resolvedFileName,
                  mimeType,
                  size: fileBuffer.length,
                }, null, 2),
              },
            ],
          };
        }
      } catch (error) {
        Logger.error(`获取飞书消息资源失败:`, error);
        const errorMessage = formatErrorMessage(error);
        return {
          content: [{ type: 'text', text: `获取飞书消息资源失败: ${errorMessage}` }],
        };
      }
    },
  );
}
