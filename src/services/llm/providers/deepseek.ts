import * as vscode from 'vscode';
import { TemplateService } from '../../../template/templateService';
import { IRepositoryAnalysisService } from '../../analysis/analysisTypes';
import { OpenAIChatCompletionsService } from './openaiChatCompletionsService';

const DEEPSEEK_API_URL = 'https://api.deepseek.com';

/**
 * DeepSeek LLM service implementation using OpenAI-compatible chat completions.
 */
export class DeepSeekService extends OpenAIChatCompletionsService {
    constructor(context: vscode.ExtensionContext, templateService: TemplateService, analysisService?: IRepositoryAnalysisService) {
        super(context, templateService, analysisService, {
            providerName: 'DeepSeek',
            modelStateKey: 'gitCommitGenie.deepseekModel',
            secretKey: 'gitCommitGenie.secret.deepseekApiKey',
            baseURL: DEEPSEEK_API_URL,
            // 官方已将 flash 系列更名为 deepseek-flash，模型清单以 /v1/models 实测为准
            useApiModelListing: true
        });
    }

    /**
     * 静态兜底清单（API 不可达时使用），id 与官方 /v1/models 实测结果保持一致。
     */
    public listSupportedModels(): string[] {
        return [
            'deepseek-flash',
            'deepseek-v4-pro'
        ];
    }
}
