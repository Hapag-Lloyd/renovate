import {
  LambdaClient,
  LayerVersionsListItem,
  ListLayerVersionsCommand,
} from '@aws-sdk/client-lambda';
import { cache } from '../../../util/cache/package/decorator';
import { Lazy } from '../../../util/lazy';
import { Datasource } from '../datasource';
import type { GetReleasesConfig, ReleaseResult } from '../types';

export interface AwsLambdaLayerFilter {
  arn: string;
  runtime: string;
  architecture: string;
}

export class AwsLambdaLayerDataSource extends Datasource {
  static readonly id = 'aws-lambda-layer';

  override readonly caching = true;

  private readonly lambda: Lazy<LambdaClient>;

  constructor() {
    super(AwsLambdaLayerDataSource.id);
    this.lambda = new Lazy(() => new LambdaClient({}));
  }

  @cache({
    namespace: `datasource-${AwsLambdaLayerDataSource.id}`,
    key: (serializedLayerFilter: string) =>
      `getSortedLambdaLayerVersions:${serializedLayerFilter}`,
  })
  async getSortedLambdaLayerVersions(
    filter: AwsLambdaLayerFilter
  ): Promise<LayerVersionsListItem[]> {
    const cmd = new ListLayerVersionsCommand({
      LayerName: filter.arn,
      CompatibleArchitecture: filter.architecture,
      CompatibleRuntime: filter.runtime,
    });

    const matchingLayerVersions = await this.lambda.getValue().send(cmd);

    matchingLayerVersions.LayerVersions =
      matchingLayerVersions.LayerVersions ?? [];

    // the API does not specify the sort order of the versions
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#listLayerVersions-property
    return matchingLayerVersions.LayerVersions.sort((layer1, layer2) => {
      return (layer1.Version ?? 0) - (layer2.Version ?? 0);
    });
  }

  @cache({
    namespace: `datasource-${AwsLambdaLayerDataSource.id}`,
    key: ({ packageName }: GetReleasesConfig) => `getReleases:${packageName}`,
  })
  async getReleases({
    packageName: serializedLambdaLayerFilter,
  }: GetReleasesConfig): Promise<ReleaseResult | null> {
    const filter: AwsLambdaLayerFilter = JSON.parse(
      serializedLambdaLayerFilter
    );

    const lambdaLayerVersions = await this.getSortedLambdaLayerVersions(filter);

    if (lambdaLayerVersions.length === 0) {
      return null;
    }

    return {
      releases: lambdaLayerVersions.map((layer) => ({
        version: layer.Version?.toString() ?? '0',
        releaseTimestamp: layer.CreatedDate,
        newDigest: layer.LayerVersionArn,
        isDeprecated: false,
      })),
    };
  }
}
