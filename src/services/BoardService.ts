import chalk from 'chalk'
import ColorConvert from 'color-convert'

import { TOKEN_FRAME_PREFIX } from '../utils/constants'
import { toCamelCase } from '../utils/strings'
import { floatToRgbInt } from '../utils/numbers'
import { log } from './LogService'
import FigmaApiService from './FigmaApiService'
import TokenService from './TokenService'

export default class BoardService {
  figmaApi: FigmaApiService
  tokens: TokenService
  boardDocument: FigmaNode | null

  constructor(tokensService: TokenService) {
    this.figmaApi = new FigmaApiService()
    this.tokens = tokensService
    this.boardDocument = null
  }

  private get tokensConfig() {
    return this.tokens.config
  }

  private get canvas() {
    return this.boardDocument?.children[0]
  }

  private get tokenFrames() {
    return this.canvas?.children.filter((child) => child.name.startsWith(TOKEN_FRAME_PREFIX)) || []
  }

  public async loadBoard() {
    try {
      log.info(`Loading Figma File with ID ${chalk.blue(this.tokensConfig.fileId)}`)

      const { data } = await this.figmaApi.getBoard(this.tokensConfig.fileId)

      if (data.document) {
        log.debug(`Found Figma file - ${data.name}`)
        this.boardDocument = data.document
      } else {
        throw new Error(log.messages.noDocumentFoundInFigmaFile(this.tokensConfig.fileId))
      }
    } catch (error) {
      log.error(error)
    }
  }

  public buildTokens() {
    this.tokenFrames.map((child) => {
      const nameSearch = child.name.replace(TOKEN_FRAME_PREFIX, '')

      if (this.tokensConfig.tokenFrames.includes(nameSearch)) {
        switch (nameSearch) {
          case 'colors':
            this.buildColorTokens(child.children)
            break
          case 'typography':
            this.buildTypographyTokens(child.children)
            break
          case 'spacing':
            this.buildSpacingTokens(child.children)
            break
          default:
            break
        }
      }
    })
  }

  private getNodeNameData(nodeName: string) {
    const namePropertySplit = nodeName.split('=')

    return {
      name: toCamelCase(
        (namePropertySplit.length > 1 ? namePropertySplit[1] : namePropertySplit[0]).toLowerCase()
      ),
      property: toCamelCase(
        (namePropertySplit.length > 1 ? namePropertySplit[0] : '').toLowerCase()
      ),
    }
  }

  /**
   * Builds an array of `TokenData` objects from a given Figma node.
   *
   * Each `node.type` type is handled differently. Currently supported node types are:
   *  - 'COMPONENT_SET'
   *
   * @param node - The Figma node
   * @param valueCallback - callback function that provides 'child' node where token values are read
   * from. Used to transform the token value outside the scope of this method
   *
   * e.g.
   * ```js
   *  this.buildTokenDataFromNode(node, (child) => child.absoluteBoundingBox.width)
   * ```
   *
   */
  private buildTokenDataFromNode(
    node: FigmaNode,
    valueCallback: (child: FigmaNode) => string | number
  ) {
    let tokens: TokenData[] = []

    switch (node.type) {
      case 'COMPONENT_SET':
        const groupName = toCamelCase(node.name.toLowerCase())

        node.children
          .filter((child) => child.type === 'COMPONENT')
          .map((child) => {
            const { name, property } = this.getNodeNameData(child.name)
            const value = valueCallback(child)

            tokens.push({
              name,
              value,
              groupName,
              figmaVariantKey: property,
            })
          })
        break

      // TODO: handle 'COMPONENT' node types
      // case 'COMPONENT':
      //   node.children.map((child) => {
      //     const { name, property } = this.getNodeNameData(child.name)
      //     const value = valueCallback(child)

      //     tokens.push({
      //       name,
      //       value,
      //       groupName: null,
      //       figmaVariantKey: property,
      //     })
      //   })
      //   break

      default:
        throw new Error(log.messages.unsupportedNodeType(node.type))
    }

    return tokens
  }

  private buildColorTokens(nodes: FigmaNode[]) {
    const tokens: TokenData[] = []

    nodes.map((node) =>
      tokens.push(
        ...this.buildTokenDataFromNode(node, (child) => {
          const { color } = child.children[0].fills[0]
          return `#${ColorConvert.rgb.hex(
            floatToRgbInt(color.r),
            floatToRgbInt(color.g),
            floatToRgbInt(color.b)
          )}`
        })
      )
    )

    this.tokens.colors = tokens

    log.info(`Built ${chalk.yellow('color')} tokens`)
  }

  private buildTypographyTokens(nodes: FigmaNode[]) {
    const tokens: TokenData[] = []

    nodes.map((node) =>
      tokens.push(
        ...this.buildTokenDataFromNode(node, (child) => {
          const { fontSize } = (child.children[0] as FigmaTextNode).style
          return fontSize
        })
      )
    )

    this.tokens.typography = tokens

    log.info(`Built ${chalk.yellow('typography')} tokens`)
  }

  private buildSpacingTokens(nodes: FigmaNode[]) {
    const tokens: TokenData[] = []

    nodes.map((node) =>
      tokens.push(
        ...this.buildTokenDataFromNode(node, (child) => {
          const { absoluteBoundingBox } = child
          return absoluteBoundingBox.width
        })
      )
    )

    this.tokens.spacing = tokens

    log.info(`Built ${chalk.yellow('spacing')} tokens`)
  }
}
