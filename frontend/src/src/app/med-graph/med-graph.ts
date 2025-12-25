// import { AfterViewInit, Component, OnInit } from '@angular/core';

// // import * as d3 from 'd3';
// // import Treeviz from 'treeviz';

// declare function initMedFlowGraph(): void;

// @Component({
//   selector: 'app-med-graph',
//   imports: [],
//   templateUrl: './med-graph.html',
//   styleUrl: './med-graph.css'
// })
// export class MedGraph implements AfterViewInit{

//   ngAfterViewInit(): void {
//     initMedFlowGraph();
//   }

// }

import { AfterViewInit, Component, OnInit } from '@angular/core';


@Component({
  selector: 'app-med-graph',
  imports: [],
  templateUrl: './med-graph.html',
  styleUrl: './med-graph.css'
})
export class MedGraph implements OnInit {

  ngOnInit() {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'NODE_CLICKED') {
        console.log('Node clicked:', event.data.payload);
        // react, route, or call backend
      }
    });
  }
}
